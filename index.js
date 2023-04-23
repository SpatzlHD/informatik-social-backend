//init express
const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");

//middlewares

app.use(
  cors({
    origin: "http://localhost:3000",
    allowedHeaders: ["Content-Type", "authorization"],
  })
);

app.use(bodyParser.json());

//dotenv
require("dotenv").config();

//database connection
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("Database connected successfully");
});
const userSchema = require("./schemas/user");
const postSchema = require("./schemas/post");

//other packages
const axios = require("axios");

//home route
app.get("/", (req, res) => {
  res.send("Hello World");
});

//posts route
app.get("/posts/all", async (req, res) => {
  const posts = await postSchema.find({});
  res.json(posts);
});

app.post("/posts", authenticateToken, async (req, res) => {
  const { content, createdAt } = req.body;
  const userID = req.user.userID;

  const post = await postSchema.create({
    content: content,
    createdAt: createdAt,
  });
  const user = await userSchema.findOne({ _id: userID });
  user.posts.push(post._id);
  await user.save();
  post.user = {
    username: user.username,

    profileImage: user.profileImage,
    id: user._id,
  };

  await post.save();
  res.json({
    code: 200,
    message: "Post created successfully",
  });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  const data = await userSchema.findOne({ username });
  if (data) {
    return res.json({
      code: 400,
      message: "User already exists",
    });
  } else {
    const user = new userSchema({
      username,
      email,
      password: await hashPassword(password),
    });
    const newUser = await user.save();
    user.refreshToken = generateRefreshToken(newUser._id.toString());
    user.profileImage = `https://picsum.photos/seed/${newUser._id}/200`;
    const newUser2 = await user.save();
    res.json({
      code: 200,
      message: "User created successfully",
      accessToken: generateAccessToken(newUser._id.toString()),
      refreshToken: newUser2.refreshToken,
      username: newUser2.username,

      profileImage: newUser2.profileImage,
    });
  }
});

app.post("/token", (req, res) => {
  const refreshToken = req.body.token;
  if (refreshToken == null) {
    res.sendStatus(401);
  }
  const tokens = userSchema.find({ refreshToken });
  if (tokens.length == 0) {
    res.sendStatus(403);
  }
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) {
      res.sendStatus(403);
    }
    const accessToken = generateAccessToken(user.userID);
    console.log(user.userID);
    res.json({ accessToken: accessToken });
  });
});

app.delete("/logout", (req, res) => {
  const refreshToken = req.body.token;
  if (refreshToken == null) {
    res.sendStatus(401);
  }
  userSchema.updateOne({ refreshToken }, { refreshToken: "" }, (err, data) => {
    if (err) {
      res.sendStatus(403);
    }
    res.json({ message: "Logged out successfully" });
  });
});

//listen on port 3001
app.listen(3001, () => {
  console.log("Server started on port 3001");
});

//hash password
const bcrypt = require("bcrypt");
const saltRounds = 10;

async function hashPassword(password) {
  return await bcrypt.hash(password, saltRounds);
}

//generate access token
const jwt = require("jsonwebtoken");

function generateAccessToken(userID) {
  const accessToken = jwt.sign(
    { userID: userID },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "600s",
    }
  );
  return accessToken;
}

function generateRefreshToken(userID) {
  const refreshToken = jwt.sign(
    {
      userID: userID,
    },
    process.env.REFRESH_TOKEN_SECRET
  );
  return refreshToken;
}

//authenticate requests
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log(token);
  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    console.log(err);
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}
