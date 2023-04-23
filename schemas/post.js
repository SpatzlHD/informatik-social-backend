const { Schema, model } = require("mongoose");

const postSchema = new Schema({
  content: String,
  createdAt: { type: Date, default: new Date().toISOString() },
  user: Object,
  likes: { type: Array, default: [] },
  comments: { type: Array, default: [] },
});

module.exports = model("Post", postSchema);
