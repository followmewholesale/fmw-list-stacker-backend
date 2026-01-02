// ================================
// FMW List Stacker Backend
// Whop OAuth + Entitlement Check
// FINAL FIX — PERSISTENT ACCESS
// ================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// ENV
// ================================
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://fmw-liststackertool.netlify.app";

const WHOP_REDIRECT_URI =
  process.env.WHOP_REDIRECT_URI ||
  "https://fmw-list-stacker-backend.onrender.com/api/oauth/callback";

if (!WHOP_CLIENT_ID || !WHOP_CLIENT_SECRET) {
  console.error("❌ Missing required Whop environment variables");
  process.exit(1);
}

// ================================
// ALLOWED PRODUCTS
// ================================
const ALLOWED_PRODUCT_IDS = [
  "prod_dvtFTdpa6eFyW", // List Stacker Tool
  "prod_k5BtByWdb76vr", // Floor 2 – Practitioner
  "prod_ugQchm3TZ61LD", // Floor 3 – Builder Circle
];

// ================================
// MIDDLEWARE
// ================================
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ================================
// HEALTH CHECK
// ================================
app.get("/", (_, res) => {
  res.json({ status: "ok", service: "FMW List Stacker Backend" });
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
// 🔁 OAUTH CALLBACK (FINAL FIX)
// ================================
app.get("/api/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/login.html`);
  }

  try {
    // 1️⃣ Exchange code → access token
    const tokenRes = await fetch("https://api.whop.com/oauth/token", {
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

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("No access token returned");
    }

    const userAccessToken = tokenData.access_token;

    // 2️⃣ Fetch entitlements
    const entRes = await fetch(
      "https://api.whop.com/api/v2/me/entitlements",
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      }
    );

    const entData = await entRes.json();
    if (!Array.isArray(entData?.data)) {
      throw new Error("Invalid entitlements response");
    }

    // 3️⃣ Check access
    const hasAccess = entData.data.some(
      (ent) =>
        ent?.product?.id &&
        ALLOWED_PRODUCT_IDS.includes(ent.product.id)
    );

    if (!hasAccess) {
      return res.redirect(`${FRONTEND_URL}/login.html`);
    }

    // 4️⃣ ✅ SET PERSISTENT COOKIE
    res.cookie("fmw_access", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    // 5️⃣ CLEAN REDIRECT (NO QUERY PARAMS)
    return res.redirect(`${FRONTEND_URL}/index.html`);
  } catch (err) {
    console.error("🔥 OAuth flow failed:", err);
    return res.redirect(`${FRONTEND_URL}/login.html`);
  }
});

// ================================
app.listen(PORT, () => {
  console.log(`✅ FMW Backend running on port ${PORT}`);
});
