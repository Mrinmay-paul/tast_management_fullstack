const express = require("express");
const router = express.Router();
const {body, validationResult} = require("express-validator");
const Task = require("../models/Task");
const Project = require("../models/Project");
// const { protect } = require('../middleware/auth');
const {protect, adminOnly} = require("../middleware/auth");

// Helper: Check project access
const checkProjectAccess = async (projectId, userId, userRole) => {
  const project = await Project.findById(projectId);
  if (!project) return {error: "Project not found", status: 404};
  const isOwner = project.owner.toString() === userId.toString();
  const isMember = project.members.some(
    (m) => m.user.toString() === userId.toString(),
  );
  if (!isOwner && !isMember && userRole !== "admin")
    return {error: "Access denied", status: 403};
  return {project};
};

// @route   GET /api/tasks?project=id
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;

    // If not admin, only show tasks from accessible projects
    if (req.user.role !== "admin") {
      const userProjects = await Project.find({
        $or: [{owner: req.user._id}, {"members.user": req.user._id}],
      }).select("_id");
      const projectIds = userProjects.map((p) => p._id);
      if (filter.project) {
        if (!projectIds.some((id) => id.toString() === filter.project)) {
          return res
            .status(403)
            .json({success: false, message: "Access denied"});
        }
      } else {
        filter.project = {$in: projectIds};
      }
    }

    const tasks = await Task.find(filter)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name color")
      .sort({createdAt: -1});

    res.json({success: true, tasks});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   POST /api/tasks
router.post(
  "/",
  protect,
  adminOnly,
  [
    body("title").trim().notEmpty().withMessage("Task title is required"),
    body("project").notEmpty().withMessage("Project ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({success: false, message: errors.array()[0].msg});
    }

    try {
      const {
        title,
        description,
        status,
        priority,
        project,
        assignedTo,
        dueDate,
        tags,
      } = req.body;
      const access = await checkProjectAccess(
        project,
        req.user._id,
        req.user.role,
      );
      if (access.error)
        return res
          .status(access.status)
          .json({success: false, message: access.error});

      const task = await Task.create({
        title,
        description,
        status,
        priority,
        project,
        assignedTo,
        dueDate,
        tags,
        createdBy: req.user._id,
      });

      await task.populate("assignedTo", "name email");
      await task.populate("createdBy", "name email");
      await task.populate("project", "name color");

      res.status(201).json({success: true, message: "Task created!", task});
    } catch (error) {
      res.status(500).json({success: false, message: "Server error"});
    }
  },
);

// @route   GET /api/tasks/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name color owner members")
      .populate("comments.user", "name email");

    if (!task)
      return res.status(404).json({success: false, message: "Task not found"});

    res.json({success: true, task});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   PUT /api/tasks/:id
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task)
      return res.status(404).json({success: false, message: "Task not found"});

    const access = await checkProjectAccess(
      task.project,
      req.user._id,
      req.user.role,
    );
    if (access.error)
      return res
        .status(access.status)
        .json({success: false, message: access.error});

    const {title, description, status, priority, assignedTo, dueDate, tags} =
      req.body;
    Object.assign(task, {
      title,
      description,
      status,
      priority,
      assignedTo,
      dueDate,
      tags,
    });
    await task.save();

    await task.populate("assignedTo", "name email");
    await task.populate("createdBy", "name email");
    await task.populate("project", "name color");

    res.json({success: true, message: "Task updated!", task});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   DELETE /api/tasks/:id
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task)
      return res.status(404).json({success: false, message: "Task not found"});

    const isCreator = task.createdBy.toString() === req.user._id.toString();
    const access = await checkProjectAccess(
      task.project,
      req.user._id,
      req.user.role,
    );

    if (!isCreator && req.user.role !== "admin") {
      if (access.error)
        return res
          .status(access.status)
          .json({success: false, message: access.error});
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({success: true, message: "Task deleted successfully"});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   POST /api/tasks/:id/comments
router.post("/:id/comments", protect, adminOnly, async (req, res) => {
  try {
    const {text} = req.body;
    if (!text)
      return res
        .status(400)
        .json({success: false, message: "Comment text required"});

    const task = await Task.findById(req.params.id);
    if (!task)
      return res.status(404).json({success: false, message: "Task not found"});

    task.comments.push({user: req.user._id, text});
    await task.save();
    await task.populate("comments.user", "name email");

    res.json({success: true, message: "Comment added!", task});
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

// @route   GET /api/tasks/dashboard/stats
router.get("/dashboard/stats", protect, async (req, res) => {
  try {
    const userProjects = await Project.find({
      $or: [
        {owner: req.user._id},
        {"members.user": req.user._id},
        ...(req.user.role === "admin" ? [{}] : []),
      ],
    }).select("_id");

    const projectIds = userProjects.map((p) => p._id);

    const [total, todo, inProgress, review, done, overdue] = await Promise.all([
      Task.countDocuments({project: {$in: projectIds}}),
      Task.countDocuments({project: {$in: projectIds}, status: "todo"}),
      Task.countDocuments({project: {$in: projectIds}, status: "in-progress"}),
      Task.countDocuments({project: {$in: projectIds}, status: "review"}),
      Task.countDocuments({project: {$in: projectIds}, status: "done"}),
      Task.countDocuments({
        project: {$in: projectIds},
        dueDate: {$lt: new Date()},
        status: {$ne: "done"},
      }),
    ]);

    const myTasks = await Task.countDocuments({
      assignedTo: req.user._id,
      status: {$ne: "done"},
    });

    res.json({
      success: true,
      stats: {
        total,
        todo,
        inProgress,
        review,
        done,
        overdue,
        myTasks,
        projects: projectIds.length,
      },
    });
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
});

module.exports = router;
