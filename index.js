// ================================
// FMW List Stacker Backend
// Whop OAuth + Entitlement Check
// ================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// ENV
// ================================
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const WHOP_API_KEY = process.env.WHOP_API_KEY;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://fmw-liststackertool.netlify.app";

const WHOP_REDIRECT_URI =
  process.env.WHOP_REDIRECT_URI ||
  "https://fmw-list-stacker-backend.onrender.com/api/oauth/callback";

if (!WHOP_CLIENT_ID || !WHOP_CLIENT_SECRET || !WHOP_API_KEY) {
  console.error("❌ Missing required Whop environment variables");
  process.exit(1);
}

// ================================
// REAL PAID PRODUCTS (THE ONLY ONES THAT GRANT ACCESS)
// ================================
const ALLOWED_PRODUCT_IDS = [
  "prod_dvtFTdpa6eFyW", // List Stacker Tool
  "prod_k5BtByWdb76vr", // Floor 2 – Practitioner
  "prod_ugQchm3TZ61LD", // Floor 3 – Builder Circle
];

app.use(cors());
app.use(express.json());

// ================================
// HEALTH CHECK
// ================================
app.get("/", (_, res) => {
  res.json({ status: "ok", service: "FMW List Stacker Backend" });
});

// ================================
// 🔑 START WHOP OAUTH (CORRECT ENDPOINT)
// ================================
app.get("/api/oauth/start", (req, res) => {
  const params = new URLSearchParams({
    client_id: WHOP_CLIENT_ID,
    redirect_uri: WHOP_REDIRECT_URI,
    response_type: "code",
    scope: "read_user",
  });

  res.redirect(`https://whop.com/oauth?${params.toString()}`);
});

// ================================
// 🔁 OAUTH CALLBACK
// ================================
app.get("/api/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/login.html?error=denied`);
  }

  try {
    // 1️⃣ Exchange code → user access token
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
      console.error("❌ Token exchange failed:", tokenData);
      throw new Error("No access token returned");
    }

    const userAccessToken = tokenData.access_token;

    // 2️⃣ Fetch entitlements for THIS USER
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
      throw new Error("Invalid entitlement response");
    }

    // 3️⃣ Check ownership of REAL PAID PRODUCTS
    const hasAccess = entData.data.some(ent =>
      ent?.product?.id &&
      ALLOWED_PRODUCT_IDS.includes(ent.product.id)
    );

    // 4️⃣ Redirect
    return res.redirect(
      hasAccess
        ? `${FRONTEND_URL}/index.html?access=granted`
        : `${FRONTEND_URL}/login.html?error=no_access`
    );
  } catch (err) {
    console.error("🔥 OAuth flow failed:", err);
    return res.redirect(`${FRONTEND_URL}/login.html?error=server`);
  }
});

// ================================
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
