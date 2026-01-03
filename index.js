// ================================
// FMW List Stacker Backend
// Whop OAuth + Entitlement Check
// OPTION A — OWNER BYPASS (FINAL, STABLE)
// Node 18+ Native Fetch
// ================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// ENV
// ================================
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const OWNER_WHOP_EMAIL = process.env.OWNER_WHOP_EMAIL?.toLowerCase();

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://fmw-liststackertool.netlify.app";

const WHOP_REDIRECT_URI =
  process.env.WHOP_REDIRECT_URI ||
  "https://fmw-list-stacker-backend.onrender.com/api/oauth/callback";

if (!WHOP_CLIENT_ID || !WHOP_CLIENT_SECRET || !OWNER_WHOP_EMAIL) {
  console.error("❌ Missing required environment variables");
  process.exit(1);
}

// ================================
// ALLOWED PAID PRODUCTS
// ================================
const ALLOWED_PRODUCT_IDS = [
  "prod_dvtFTdpa6eFyW", // List Stacker Tool
  "prod_k5BtByWdb76vr", // Floor 2 – Practitioner
  "prod_ugQchm3TZ61LD", // Floor 3 – Builder Circle
];

// ================================
// MIDDLEWARE
// ================================
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ================================
// HEALTH CHECK
// ================================
app.get("/", (_, res) => {
  res.json({ status: "ok", service: "FMW List Stacker Backend" });
});

// ================================
// 🔐 AUTH CHECK (COOKIE-BASED)
// ================================
app.get("/api/auth/check", (req, res) => {
  res.json({ authenticated: req.cookies?.fmw_access === "1" });
});

// ================================
// 🔐 FINALIZE SESSION (FIRST-PARTY COOKIE)
// ================================
app.post("/api/auth/session", (_, res) => {
  res.cookie("fmw_access", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  res.json({ ok: true });
});

// ================================
// 🔑 START WHOP OAUTH
// ================================
app.get("/api/oauth/start", (_, res) => {
  const params = new URLSearchParams({
    client_id: WHOP_CLIENT_ID,
    redirect_uri: WHOP_REDIRECT_URI,
    response_type: "code",
    scope: "read_user",
  });

  res.redirect(`https://whop.com/oauth/?${params.toString()}`);
});

// ================================
// 🔁 OAUTH CALLBACK (SAFE + OWNER BYPASS)
// ================================
app.get("/api/oauth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${FRONTEND_URL}/login.html`);

  try {
    // ----------------------------
    // 1️⃣ TOKEN EXCHANGE (SAFE)
    // ----------------------------
    const tokenRes = await fetch("https://api.whop.com/v5/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: WHOP_CLIENT_ID,
        client_secret: WHOP_CLIENT_SECRET,
        redirect_uri: WHOP_REDIRECT_URI,
      }),
    });

    const tokenText = await tokenRes.text();
    console.log("Token response status:", tokenRes.status);
    console.log("Token response body:", tokenText);
    if (!tokenText) throw new Error("Empty token response");

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      throw new Error("Invalid token JSON");
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("No access token");

    // ----------------------------
    // 2️⃣ FETCH USER PROFILE
    // ----------------------------
    const userRes = await fetch("https://api.whop.com/api/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userText = await userRes.text();
    if (!userText) throw new Error("Empty user response");

    let userData;
    try {
      userData = JSON.parse(userText);
    } catch {
      throw new Error("Invalid user JSON");
    }

    const userEmail = userData?.email?.toLowerCase();

    // ----------------------------
    // ✅ OWNER BYPASS
    // ----------------------------
    if (userEmail === OWNER_WHOP_EMAIL) {
      return res.redirect(`${FRONTEND_URL}/index.html?session=success`);
    }

    // ----------------------------
    // 3️⃣ FETCH ENTITLEMENTS
    // ----------------------------
    const entRes = await fetch(
      "https://api.whop.com/api/v2/me/entitlements",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const entText = await entRes.text();
    if (!entText) throw new Error("Empty entitlements response");

    let entData;
    try {
      entData = JSON.parse(entText);
    } catch {
      throw new Error("Invalid entitlements JSON");
    }

    const hasAccess = Array.isArray(entData?.data) &&
      entData.data.some(
        (ent) =>
          ent?.product?.id &&
          ALLOWED_PRODUCT_IDS.includes(ent.product.id)
      );

    if (!hasAccess) {
      return res.redirect(`${FRONTEND_URL}/login.html`);
    }

    // ----------------------------
    // ✅ SUCCESS → FRONTEND FINALIZES COOKIE
    // ----------------------------
    return res.redirect(`${FRONTEND_URL}/index.html?session=success`);

  } catch (err) {
    console.error("🔥 OAuth flow failed:", err.message);
    return res.redirect(`${FRONTEND_URL}/login.html`);
  }
});

// ================================
app.listen(PORT, () => {
  console.log(`✅ FMW Backend running on port ${PORT}`);
});
