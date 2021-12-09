const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });

    app.listen(3000, () => {
      console.log("server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const userTweetsDbObjectResponse = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.dateTime,
  };
};

const dbObjectIntoResponse = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const tweetDbIntoResponse = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

const likesIntoResponse = (dbObject) => {
  return {
    likes: Object.values(dbObject.map((each) => each.username)),
  };
};

const replyDbObjectIntoResponse = (dbObject) => {
  return {
    replies: Object.values(dbObject.map((each) => each)),
  };
};

const followingObjectIntoResponse = (dbObject) => {
  return {
    name: dbObject.name,
  };
};

function authenticationToken(request, response, next) {
  let jwtToken = "";
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

// SECTION 1 API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getUsernamePassword = `
    SELECT * FROM user 
    WHERE username = '${username}';`;
  const userDatabase = await db.get(getUsernamePassword);
  if (userDatabase === undefined) {
    const lengthOfPassword = password.length;
    if (lengthOfPassword >= 6) {
      const hashedPassword = await bcrypt.hash(request.body.password, 10);
      const postUserQuery = `
        INSERT INTO user
        (name,username,password,gender)
        VALUES
        ('${name}','${username}','${hashedPassword}','${gender}');`;
      const postQuery = await db.run(postUserQuery);
      response.status("200");
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

/// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  const dataLoginUser = await db.get(getUserQuery);

  if (dataLoginUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dataLoginUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

/// API 3

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const getTweetsQuery = `
      SELECT 
      *
      FROM 
      tweet INNER JOIN user ON tweet.user_id = user.user_id
      INNER JOIN follower ON tweet.user_id = follower.follower_user_id
      GROUP BY tweet.tweet_id
      ORDER BY tweet.date_time DESC
      LIMIT 4;`;
    const tweetData = await db.all(getTweetsQuery);
    response.send(tweetData.map((each) => dbObjectIntoResponse(each)));
  }
);

/// API 4

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
  const getUsername = await db.get(getUsernameUserId);

  const getFollowingQuery = `
    SELECT *
     FROM 
     follower INNER JOIN user 
     ON 
     follower.following_user_id = user.user_id
     WHERE follower.follower_user_id = ${getUsername.user_id};`;
  const followingData = await db.all(getFollowingQuery);

  response.send(followingData.map((each) => followingObjectIntoResponse(each)));
});

/// API 5

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
  const getUsername = await db.get(getUsernameUserId);

  const getFollowingQuery = `
    SELECT * FROM
      follower INNER JOIN user
      ON follower.follower_user_id = user.user_id
      WHERE follower.following_user_id = ${getUsername.user_id};`;
  const followingData = await db.all(getFollowingQuery);
  response.send(followingData.map((each) => followingObjectIntoResponse(each)));
});

/// API 6
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
  const getUsername = await db.get(getUsernameUserId);

  const getTweetQuey = `
    SELECT tweet.tweet AS tweet,
    COUNT(like.like_id) AS likes,
    COUNT(reply.reply_id) AS replies,
    date_time 
    FROM
    tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN like ON like.tweet_id = reply.tweet_id INNER JOIN 
    follower ON follower.following_user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId} AND follower.following_user_id = ${getUsername.user_id};`;
  const getTweets = await db.get(getTweetQuey);
  if (getTweets.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweetDbIntoResponse(getTweets));
  }
});

/// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
    const getUsername = await db.get(getUsernameUserId);

    const getLikedTweetsQuery = `
    SELECT 
    * 
    FROM 
    user INNER JOIN follower ON user.user_id = follower.following_user_id
    INNER JOIN like ON like.user_id = user.user_id
    WHERE like.tweet_id = ${tweetId} AND follower.following_user_id= ${getUsername.user_id}
    GROUP BY user.username;`;
    const getLikedTweets = await db.all(getLikedTweetsQuery);
    if (getLikedTweets.length >= 1) {
      response.send(getLikedTweets);
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

/// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
    const getUsername = await db.get(getUsernameUserId);

    const getReplyTweetsQuery = `
    SELECT 
    user.name AS name,
    reply.reply AS reply
    FROM 
    user INNER JOIN follower ON user.user_id = follower.following_user_id
    INNER JOIN reply ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ${tweetId} AND user.user_id = ${getUsername.user_id}
    GROUP BY user.username;`;
    const getReplyTweet = await db.all(getReplyTweetsQuery);
    if (getReplyTweet.length >= 1) {
      response.send(replyDbObjectIntoResponse(getReplyTweet));
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

/// API 9

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
  const getUsername = await db.get(getUsernameUserId);

  const getTweetsQuery = `
    SELECT 
    tweet.tweet AS tweet,
    COUNT(DISTINCT(like.like_id)) As likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
    FROM 
    tweet LEFT JOIN like ON tweet.user_id = like.user_id
    LEFT JOIN reply ON tweet.user_id = reply.user_id
    WHERE tweet.user_id = ${getUsername.user_id}
    GROUP BY tweet.tweet_id
    ;`;
  const getTweets = await db.all(getTweetsQuery);
  response.send(getTweets.map((each) => userTweetsDbObjectResponse(each)));
});

/// API 10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
  const getUsername = await db.get(getUsernameUserId);

  const postTweetQuery = `
    INSERT INTO tweet
    (tweet)
    VALUES
    ('${tweet}')
    ;`;

  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUsernameUserId = `
  SELECT * FROM user WHERE username = '${username}';`;
    const getUsername = await db.get(getUsernameUserId);

    const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE tweet_id = ${tweetId}
    AND tweet.user_id = ${getUsername.user_id};`;

    const deleteTweet = await db.run(deleteTweetQuery);
    console.log(deleteTweet);
    if (deleteTweet.changes === 1) {
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
