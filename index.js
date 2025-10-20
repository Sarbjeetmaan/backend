require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;

// =======================
// MongoDB Models
// =======================
const User = mongoose.model("user", {
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
});

const Product = mongoose.model("product", {
  id: { type: Number, required: true, unique: true }, // ✅ unique ID
  name: { type: String, required: true },
  images: [{ type: String, required: true }],
  category: { type: String, required: true },
  new_price: { type: Number, required: true },
  old_price: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  available: { type: Boolean, default: true },
});

const Cart = mongoose.model("cart", {
  email: { type: String, required: true },
  items: { type: Map, of: Number, default: {} },
});

// =======================
// Middleware
// =======================
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://project-3v49.vercel.app",
      "https://admin-68ww.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use("/images", express.static("upload/images"));

// =======================
// Multer Setup
// =======================
const storage = multer.diskStorage({
  destination: "./upload/images",
  filename: (req, file, cb) => {
    cb(
      null,
      `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`
    );
  },
});
const upload = multer({ storage });

// =======================
// JWT Middleware
// =======================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res
        .status(403)
        .json({ success: false, message: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Admin access required" });
  }
  next();
}

// =======================
// Routes
// =======================

// Upload images
app.post("/upload", upload.array("product", 10), (req, res) => {
  const BASE_URL =
    process.env.BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://backend-91e3.onrender.com"
      : `http://localhost:${port}`);

  const imageUrls = req.files.map(
    (file) => `${BASE_URL}/images/${file.filename}`
  );
  res.json({ success: 1, image_urls: imageUrls });
});

// ✅ Add product (IDs start from 7000)
app.post("/addproduct", async (req, res) => {
  try {
    const lastProduct = await Product.findOne({}).sort({ id: -1 });
    const newId = lastProduct ? lastProduct.id + 1 : 7000;

    const imagesArray = Array.isArray(req.body.images)
      ? req.body.images
      : [req.body.images];

    const product = new Product({
      id: newId,
      name: req.body.name,
      images: imagesArray,
      category: req.body.category,
      new_price: req.body.new_price,
      old_price: req.body.old_price,
    });

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// Remove product
app.post("/removeproduct", async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Get all products (sorted newest first)
app.get("/allproducts", async (req, res) => {
  try {
    const products = await Product.find({}).sort({ date: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ---------------- AUTH ROUTES ----------------
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ success: false, message: "Invalid email" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "Invalid password" });

    const token = jwt.sign(
      { username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ---------------- CART ROUTES ----------------

// ✅ Save cart (normalize keys to strings)
app.post("/savecart", authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { cartItems } = req.body;

    const normalizedForDb = {};
    for (const [k, v] of Object.entries(cartItems || {})) {
      normalizedForDb[String(k)] = v;
    }

    await Cart.findOneAndUpdate(
      { email },
      { items: normalizedForDb },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Cart saved successfully" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error saving cart" });
  }
});

// ✅ Get cart (convert Map to plain object)
app.get("/getcart", authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    const userCart = await Cart.findOne({ email });

    let cartObj = {};
    if (userCart && userCart.items) {
      if (typeof userCart.items.toObject === "function") {
        cartObj = userCart.items.toObject();
      } else {
        cartObj = Object.fromEntries(userCart.items);
      }
    }

    // Convert string keys -> numbers for frontend
    const normalized = {};
    for (const [k, v] of Object.entries(cartObj)) {
      normalized[Number(k)] = v;
    }

    return res.json({ success: true, cart: normalized });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Error loading cart" });
  }
});

// ---------------- ADMIN ROUTES ----------------
app.post("/makeadmin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const updated = await User.findOneAndUpdate(
      { email },
      { role: "admin" },
      { new: true }
    );
    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({
      success: true,
      message: `${email} is now an admin`,
      user: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/verifyAdmin", authenticateToken, (req, res) => {
  res.json({ isAdmin: req.user.role === "admin" });
});

// ---------------- MongoDB ----------------
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

// ---------------- Start Server ----------------
app.get("/", (req, res) =>
  res.send("✅ API is running successfully!")
);
app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${port}`)
);
