// ================================
// FMW List Stacker Backend
// Whop OAuth Authorization Handler
// ================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// ENV CONFIG (REQUIRED)
// ================================
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;

// ✅ Render OAuth callback
const WHOP_REDIRECT_URI =
  process.env.WHOP_REDIRECT_URI ||
  "https://fmw-list-stacker-backend.onrender.com/api/oauth/callback";

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://fmw-liststackertool.netlify.app";

if (!WHOP_CLIENT_ID || !WHOP_CLIENT_SECRET) {
  console.error("❌ Missing Whop client credentials in environment variables");
  process.exit(1);
}

// ================================
// ALLOWED PRODUCT IDS (LOCKED)
// ================================
const ALLOWED_PRODUCT_IDS = [
  "prod_dvtFTdpa6eFyW", // List Stacker Tool
  "prod_k5BtByWdb76vr", // Floor 2 – Practitioner Access
  "prod_ugQchm3TZ61LD", // Floor 3 – Builder’s Circle
];

// ================================
// MIDDLEWARE
// ================================
app.use(cors());
app.use(express.json());

// ================================
// HEALTH CHECK
// ================================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "FMW List Stacker Backend",
    time: new Date().toISOString(),
  });
});

// ================================
// 🔑 START WHOP OAUTH FLOW
// ================================
app.get("/api/oauth/start", (req, res) => {
  const params = new URLSearchParams({
    client_id: WHOP_CLIENT_ID,
    redirect_uri: WHOP_REDIRECT_URI,
    response_type: "code",
    scope: "user.products",
  });

  res.redirect(`https://whop.com/oauth/authorize?${params.toString()}`);
});

// ================================
// WHOP OAUTH CALLBACK
// ================================
app.get("/api/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?access=denied`);
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
      console.error("❌ Token error:", tokenData);
      throw new Error("No access token returned from Whop");
    }

    const accessToken = tokenData.access_token;

    // 2️⃣ Fetch entitlements
    const entitlementsRes = await fetch(
      "https://api.whop.com/api/v2/me/entitlements",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const entitlementsData = await entitlementsRes.json();

    if (!Array.isArray(entitlementsData?.data)) {
      console.error("❌ Invalid entitlements response:", entitlementsData);
      throw new Error("Invalid entitlements response");
    }

    // 3️⃣ Check product access
    const hasAccess = entitlementsData.data.some(
      (entitlement) =>
        entitlement?.product?.id &&
        ALLOWED_PRODUCT_IDS.includes(entitlement.product.id)
    );

    // 4️⃣ Redirect back to frontend
    return res.redirect(
      `${FRONTEND_URL}?access=${hasAccess ? "granted" : "denied"}`
    );
  } catch (err) {
    console.error("🔥 Whop OAuth error:", err);
    return res.redirect(`${FRONTEND_URL}?access=error`);
  }
});

// ================================
// START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`✅ FMW Backend running on port ${PORT}`);
});