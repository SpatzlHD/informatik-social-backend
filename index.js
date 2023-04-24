//init express
const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");

//init socket.io
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});
io.use((socket, next) => {
  if (socket.handshake.auth && socket.handshake.auth.token) {
    jwt.verify(
      socket.handshake.auth.token,
      process.env.ACCESS_TOKEN_SECRET,
      (err, user) => {
        if (err) {
          return next(new Error("Authentication error"));
        }
        socket.user = user;
        next();
      }
    );
  } else {
    next(new Error("Authentication error"));
  }
});

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

//home route
app.get("/", (req, res) => {
  res.send("Hello World");
});

//posts route
app.get("/posts/all", async (req, res) => {
  console.log("Sending all posts to client...");
  const posts = await postSchema.find({}).sort({ createdAt: -1 });
  res.json(posts);
});

app.post("/posts", authenticateToken, async (req, res) => {
  console.log(`Creating post for user ${req.user.userID}...`);
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

app.get("/user/:id", async (req, res) => {
  console.log(`Sending user data for User ${req.params.id} to client... `);
  const user = await userSchema.findOne({ _id: req.params.id });
  if (user) {
    res.json({
      code: 200,
      message: "User found",
      username: user.username,
      profileImage: user.profileImage,
      verified: user.verified,
      posts: user.posts,
    });
  } else {
    res.json({
      code: 404,
      message: "User not found",
    });
  }
});

app.get("/user/:id/posts", async (req, res) => {
  console.log(`Sending posts for User ${req.params.id} to client... `);

  const posts = await postSchema.find({}).sort({
    createdAt: -1,
  });
  const filteredPosts = posts.filter((post) => post.user.id == req.params.id);
  console.log(filteredPosts);

  res.json(filteredPosts);
});

app.post("/register", async (req, res) => {
  console.log("Creating new user...");
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
      userID: newUser2._id.toString(),
      profileImage: newUser2.profileImage,
    });
  }
});

app.post("/login", async (req, res) => {
  console.log("Logging in user...");
  const { username, password } = req.body;

  const data = userSchema.findOne({ username });
  if (data) {
    const user = await data;
    const isPasswordValid = await comparePassword(password, user.password);
    if (isPasswordValid) {
      user.refreshToken = generateRefreshToken(user._id.toString());
      const newUser = await user.save();
      res.json({
        code: 200,
        message: "User logged in successfully",
        accessToken: generateAccessToken(user._id.toString()),
        refreshToken: newUser.refreshToken,
        username: newUser.username,
        userID: newUser._id.toString(),
        profileImage: newUser.profileImage,
      });
    } else {
      res.json({
        code: 400,
        message: "Invalid credentials",
      });
    }
  }
});

app.post("/token", (req, res) => {
  console.log("Generating new access token...");
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

    res.json({ accessToken: accessToken });
  });
});

app.delete("/logout", (req, res) => {
  console.log("Logging out user...");
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

//socket.io
io.on("connection", (socket) => {
  console.log("user connected" + " " + socket.id + " " + socket.user.userID);
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
  socket.on("newPost", async (data) => {
    console.log("New post created");
    const { content, createdAt } = data;
    const userID = socket.user.userID;

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
      verified: user.verified,
    };

    await post.save();
    io.emit("newPostData", post);
  });

  socket.on("like", async (data) => {
    console.log("Like added");
    const post = await postSchema.findOne({ _id: data.postID });
    if (post.likes.includes(socket.user.userID)) {
      return;
    }
    post.likes.push(socket.user.userID);
    const newPost = await post.save();

    io.emit("likeAdd", newPost);
  });

  socket.on("unlike", async (data) => {
    console.log("Like removed");
    const post = await postSchema.findOne({ _id: data.postID });

    if (!post.likes.includes(data.userID)) {
      return;
    }

    post.likes.splice(post.likes.indexOf(data.userID), 1);
    const newPost = await post.save();
    io.emit("likeRemove", newPost);
  });
});

//listen on port 3001
server.listen(3001, () => {
  console.log("Server started on port 3001");
});

//hash password
const bcrypt = require("bcrypt");
const saltRounds = 10;

async function hashPassword(password) {
  console.log("Hashing password...");
  return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(password, hash) {
  console.log("Comparing password...");
  return await bcrypt.compare(password, hash);
}

//generate access token
const jwt = require("jsonwebtoken");

function generateAccessToken(userID) {
  console.log("Generating access token...");
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
  console.log("Generating refresh token...");
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
  console.log("Authenticating request...");
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
