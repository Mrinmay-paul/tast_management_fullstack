const express = require("express");
const router = express.Router();
const {body, validationResult} = require("express-validator");
const Project = require("../models/Project");
const Task = require("../models/Task");
const User = require("../models/User");
// const { protect } = require('../middleware/auth');
const {protect, adminOnly} = require("../middleware/auth");

// @route   GET /api/projects
router.get("/", protect, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        {owner: req.user._id},
        {"members.user": req.user._id},
        ...(req.user.role === "admin" ? [{}] : []),
      ],
    })
      .populate("owner", "name email")
      .populate("members.user", "name email")
      .sort({createdAt: -1});

    // Add task stats
    const projectsWithStats = await Promise.all(
      projects.map(async (p) => {
        const tasks = await Task.find({project: p._id});
        const done = tasks.filter((t) => t.status === "done").length;
        const overdue = tasks.filter(
          (t) => t.dueDate && new Date() > t.dueDate && t.status !== "done",
        ).length;
        return {
          ...p.toObject(),
          taskStats: {
            total: tasks.length,
            done,
            overdue,
            progress: tasks.length
              ? Math.round((done / tasks.length) * 100)
              : 0,
          },
        };
      }),
    );

    res.json({success: true, projects: projectsWithStats});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   POST /api/projects
router.post(
  "/",
  protect,
  adminOnly,
  [
    body("name").trim().notEmpty().withMessage("Project name is required"),
    body("description").optional().isLength({max: 500}),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({success: false, message: errors.array()[0].msg});
    }

    try {
      const {name, description, status, priority, dueDate, color} = req.body;
      const project = await Project.create({
        name,
        description,
        status,
        priority,
        dueDate,
        color,
        owner: req.user._id,
        // members: [{user: req.user._id, role: "admin"}],
        members: [
          {user: req.user._id, role: "admin"},
          ...(req.body.members || []).map((id) => ({
            user: id,
            role: "member",
          })),
        ],
      });

      await project.populate("owner", "name email");
      res
        .status(201)
        .json({success: true, message: "Project created!", project});
    } catch (error) {
      console.error("error on create project:", error);
      res.status(500).json({success: false, message: "Server error"});
    }
  },
);

// @route   GET /api/projects/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("owner", "name email")
      .populate("members.user", "name email");

    if (!project)
      return res
        .status(404)
        .json({success: false, message: "Project not found"});

    const isOwner = project.owner._id.toString() === req.user._id.toString();
    const isMember = project.members.some(
      (m) => m.user._id.toString() === req.user._id.toString(),
    );
    if (!isOwner && !isMember && req.user.role !== "admin") {
      return res.status(403).json({success: false, message: "Access denied"});
    }

    res.json({success: true, project});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   PUT /api/projects/:id
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res
        .status(404)
        .json({success: false, message: "Project not found"});

    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdminMember = project.members.some(
      (m) =>
        m.user.toString() === req.user._id.toString() && m.role === "admin",
    );
    if (!isOwner && !isAdminMember && req.user.role !== "admin") {
      return res
        .status(403)
        .json({success: false, message: "Only admins can edit projects"});
    }

    const {name, description, status, priority, dueDate, color} = req.body;
    Object.assign(project, {
      name,
      description,
      status,
      priority,
      dueDate,
      color,
    });
    await project.save();
    await project.populate("owner", "name email");
    await project.populate("members.user", "name email");

    res.json({success: true, message: "Project updated!", project});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   DELETE /api/projects/:id
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res
        .status(404)
        .json({success: false, message: "Project not found"});

    const isOwner = project.owner.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the project owner can delete it",
      });
    }

    await Task.deleteMany({project: req.params.id});
    await Project.findByIdAndDelete(req.params.id);

    res.json({success: true, message: "Project deleted successfully"});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   POST /api/projects/:id/members
router.post("/:id/members", protect, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res
        .status(404)
        .json({success: false, message: "Project not found"});

    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdminMember = project.members.some(
      (m) =>
        m.user.toString() === req.user._id.toString() && m.role === "admin",
    );
    if (!isOwner && !isAdminMember && req.user.role !== "admin") {
      return res
        .status(403)
        .json({success: false, message: "Only admins can add members"});
    }

    const {email, role} = req.body;
    const userToAdd = await User.findOne({email});
    if (!userToAdd)
      return res
        .status(404)
        .json({success: false, message: "User not found with that email"});

    const alreadyMember = project.members.some(
      (m) => m.user.toString() === userToAdd._id.toString(),
    );
    if (alreadyMember)
      return res
        .status(400)
        .json({success: false, message: "User already a member"});

    project.members.push({user: userToAdd._id, role: role || "member"});
    await project.save();
    await project.populate("members.user", "name email");

    res.json({
      success: true,
      message: `${userToAdd.name} added to project!`,
      project,
    });
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   DELETE /api/projects/:id/members/:userId
router.delete("/:id/members/:userId", protect, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res
        .status(404)
        .json({success: false, message: "Project not found"});

    const isOwner = project.owner.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res
        .status(403)
        .json({success: false, message: "Only owner can remove members"});
    }

    project.members = project.members.filter(
      (m) => m.user.toString() !== req.params.userId,
    );
    await project.save();

    res.json({success: true, message: "Member removed", project});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

module.exports = router;
