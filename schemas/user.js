const { model, Schema } = require("mongoose");

const userSchema = new Schema({
  username: String,
  email: String,
  password: String,
  profileImage: String,
  createdAt: { type: Date, default: new Date().toISOString() },
  refreshToken: String,

  posts: { type: Array, default: [] },
});

module.exports = model("User", userSchema);
