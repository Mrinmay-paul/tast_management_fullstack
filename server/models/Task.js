const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Task title is required"],
    trim: true,
    maxlength: [150, "Title cannot exceed 150 characters"],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, "Description cannot exceed 1000 characters"],
  },
  status: {
    type: String,
    enum: ["todo", "in-progress", "review", "done"],
    default: "todo",
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  dueDate: {
    type: Date,
  },
  tags: [{type: String}],
  comments: [
    {
      user: {type: mongoose.Schema.Types.ObjectId, ref: "User"},
      text: {type: String, required: true},
      createdAt: {type: Date, default: Date.now},
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// taskSchema.pre('save', function (next) {
//   this.updatedAt = Date.now();
//   next();
// });
taskSchema.pre("save", function() {
  this.updatedAt = Date.now();
});

// Virtual for overdue check
taskSchema.virtual("isOverdue").get(function () {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && this.status !== "done";
});

taskSchema.set("toJSON", {virtuals: true});
taskSchema.set("toObject", {virtuals: true});

module.exports = mongoose.model("Task", taskSchema);
