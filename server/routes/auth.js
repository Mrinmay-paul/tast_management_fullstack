const express = require("express");
const router = express.Router();
const {body, validationResult} = require("express-validator");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
// const { protect } = require('../middleware/auth');
const {protect} = require("../middleware/auth");

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({id}, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @route   POST /api/auth/register
router.post(
  "/register",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({max: 50}),
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
    body("password")
      .isLength({min: 6})
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        message: errors.array()[0].msg,
      });
    }

    try {
      const {name, email, password, role} = req.body;

      const existingUser = await User.findOne({email});
      if (existingUser) {
        return res
          .status(400)
          .json({success: false, message: "Email already registered"});
      }

      // First user gets admin role
      // const userCount = await User.countDocuments();
      // const assignedRole =
      //   userCount === 0 ? "admin" : role === "admin" ? "admin" : "member";

      // Check if admin already exists
      const existingAdmin = await User.findOne({role: "admin"});

      let assignedRole = "member";

      // First registered user becomes admin
      if (!existingAdmin) {
        assignedRole = "admin";
      }

      // Prevent creating another admin
      if (role === "admin" && existingAdmin) {
        return res.status(400).json({
          success: false,
          message: "Admin already exists",
        });
      }

      const user = await User.create({
        name,
        email,
        password,
        role: assignedRole,
      });

      const token = generateToken(user._id);
      res.status(201).json({
        success: true,
        message: "Account created successfully!",
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({success: false, message: error.message || "Server error"});
    }
  },
);

// @route   POST /api/auth/login
router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({success: false, message: errors.array()[0].msg});
    }

    try {
      const {email, password} = req.body;
      const user = await User.findOne({email}).select("+password");

      if (!user || !(await user.matchPassword(password))) {
        return res
          .status(401)
          .json({success: false, message: "Invalid email or password"});
      }

      const token = generateToken(user._id);
      res.json({
        success: true,
        message: "Welcome back!",
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      res.status(500).json({success: false, message: "Server error"});
    }
  },
);

// @route   GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({success: true, user});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   PUT /api/auth/profile
router.put("/profile", protect, async (req, res) => {
  try {
    const {name} = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {name},
      {new: true, runValidators: true},
    );
    res.json({success: true, message: "Profile updated", user});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

module.exports = router;
