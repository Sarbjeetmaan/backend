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
  role: { type: String, default: "user" }, // 👈 default role is user
});

const Product = mongoose.model("product", {
  id: { type: Number, required: true },
  name: { type: String, required: true },
  images: [{ type: String, required: true }], // Multiple images
  category: { type: String, required: true },
  new_price: { type: Number, required: true },
  old_price: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  available: { type: Boolean, default: true },
});

// =======================
// Middleware
// =======================
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://project-epax.vercel.app'
  ],
  credentials: true,
}));
app.use(express.json());
app.use('/images', express.static('upload/images'));

// =======================
// Multer Setup for Uploads
// =======================
const storage = multer.diskStorage({
  destination: './upload/images',
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// =======================
// Routes
// =======================

// Root
app.get("/", (req, res) => res.send("✅ Server Running"));

// Upload multiple images
app.post("/upload", upload.array('product', 10), (req, res) => {
  const imageUrls = req.files.map(file => `http://localhost:${port}/images/${file.filename}`);
  res.json({ success: 1, image_urls: imageUrls });
});

// Add product
app.post('/addproduct', async (req, res) => {
  try {
    const products = await Product.find({});
    const id = products.length > 0 ? products[products.length - 1].id + 1 : 1;

    const product = new Product({
      id,
      name: req.body.name,
      images: req.body.images, // array of image URLs
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
app.post('/removeproduct', async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Get all products
app.get('/allproducts', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =======================
// Auth Routes
// =======================

// Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 👇 Example: make a specific email admin
    const role = email === "admin@example.com" ? "admin" : "user";

    const newUser = new User({ username, email, password: hashedPassword, role });
    await newUser.save();

    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid password" });
    }

    // Include role in JWT
    const token = jwt.sign(
      { username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token,
      role: user.role, // 👈 send role to frontend
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =======================
// MongoDB Connection
// =======================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err.message));

// =======================
// Start Server
// =======================
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
