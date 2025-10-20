require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;

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
  id: { type: Number, required: true, unique: true },
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

// =======================
// Multer (memory storage)
// =======================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =======================
// Cloudinary Config
// =======================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

// =======================
// JWT Middleware
// =======================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token provided" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token" });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

// =======================
// Routes
// =======================

// Upload images directly from memory to Cloudinary
app.post("/upload", upload.array("product", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ success: false, message: "No files uploaded" });

    const imageUrls = [];

    for (const file of req.files) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products" },
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      imageUrls.push(result.secure_url);
    }

    res.json({ success: true, image_urls: imageUrls });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add product (admin only)
app.post("/addproduct", authenticateToken, requireAdmin, async (req, res) => {
  console.log("Add Product Body:", req.body); // For debugging
  try {
    const { name, images, category, new_price, old_price } = req.body;

    if (!name || !images || images.length === 0 || !category || !new_price || !old_price) {
      return res.status(400).json({ success: false, message: "All product fields are required" });
    }

    const lastProduct = await Product.findOne({}).sort({ id: -1 });
    const newId = lastProduct ? lastProduct.id + 1 : 7000;

    const product = new Product({
      id: newId,
      name,
      images: Array.isArray(images) ? images : [images],
      category,
      new_price: Number(new_price),
      old_price: Number(old_price),
    });

    await product.save();
    console.log("Product saved:", product);
    res.json({ success: true, product });
  } catch (err) {
    console.error("Add Product Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Remove product (admin only)
app.post("/removeproduct", authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Remove Product Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all products
app.get("/allproducts", async (req, res) => {
  try {
    const products = await Product.find({}).sort({ date: -1 });
    res.json(products);
  } catch (err) {
    console.error("Get All Products Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------- AUTH ROUTES ----------------
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ success: false, message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: "Invalid email" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid password" });

    const token = jwt.sign(
      { username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ success: true, token, role: user.role });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------- MongoDB ----------------
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

// ---------------- Start Server ----------------
app.get("/", (req, res) => res.send("✅ API is running successfully!"));
app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
