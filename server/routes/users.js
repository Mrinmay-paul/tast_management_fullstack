const express = require("express");
const router = express.Router();
const User = require("../models/User");
const {protect, adminOnly} = require("../middleware/auth");

// @route   GET /api/users  (admin only)
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().sort({createdAt: -1});
    res.json({success: true, users});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   GET /api/users/search?email=...
router.get("/search", protect, async (req, res) => {
  try {
    const {email, name} = req.query;
    const filter = {};
    if (email) filter.email = {$regex: email, $options: "i"};
    if (name) filter.name = {$regex: name, $options: "i"};

    const users = await User.find(filter).select("name email role").limit(10);
    res.json({success: true, users});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   PUT /api/users/:id/role  (admin only)
router.put("/:id/role", protect, adminOnly, async (req, res) => {
  try {
    const {role} = req.body;
    if (!["admin", "member"].includes(role)) {
      return res.status(400).json({success: false, message: "Invalid role"});
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {role},
      {new: true},
    );
    if (!user)
      return res.status(404).json({success: false, message: "User not found"});

    res.json({success: true, message: `Role updated to ${role}`, user});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   DELETE /api/users/:id  (admin only)
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res
        .status(400)
        .json({success: false, message: "Cannot delete your own account"});
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({success: true, message: "User deleted"});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

module.exports = router;
