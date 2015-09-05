var restify = require('restify');
var seguir = require('seguir');
var bunyan = require('bunyan');
var _ = require('lodash');
var debug = require('debug')('seguir:server');

var defaultLogger = bunyan.createLogger({
  name: 'seguir',
  serializers: restify.bunyan.serializers
});

function bootstrapServer (api, config, next) {

  var server = restify.createServer({
    name: 'seguir',
    version: '0.1.0',
    log: config.logger || defaultLogger
  });

  var u = api.urls;

  // Default middleware
  server.use(restify.bodyParser({mapParams: true}));
  server.use(restify.queryParser({mapParams: false}));
  server.use(restify.gzipResponse());
  server.use(restify.CORS());
  server.use(function (req, res, cb) {
    debug(req.url, req.params, req.headers);
    cb();
  });

  // Logging
  server.on('after', function (request, response, route, error) {
    var fn = error ? 'error' : 'info';
    if (api.config.logging) {
      request.log[fn]({req: request, res: response, route: route, err: error}, 'request');
    }
  });

  server.get(/\/docs\/current\/?.*/, restify.serveStatic({
    directory: './doc',
    default: 'index.html'
  }));

  server.get('/status', function (req, res, cb) {
    api.auth.getAccounts(function (err, accounts) {
      if (err) { return _error(err); }
      var statusConfig = _.clone(config);
      delete statusConfig.logger;
      res.send({status: 'OK', config: statusConfig, accounts: accounts});
      cb();
    });
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());

  server.get('/', api.auth.checkRequest, function (req, res, cb) {
    res.send({status: 'Seguir - OK'});
    cb();
  });

  var coerce = api.auth.coerceUserToUuid;

  function _error (err) {
    return new restify.HttpError(err);
  }

  function _response (res, next) {
    return function (err, result) {
      if (err) { return next(_error(err)); }
      res.send(result);
      next();
    };
  }

  /**
   * @apiDefine ApiUsers Users
   * This is a collection of methods that allow you to create and retrieve users.
   */

  /**
   * @api {post} /user/:user Update a user
   * @apiName Users
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Updates a user.
   * @apiParam {String} user the guid or altid of the user
   * @apiParam {String} username the name of the user
   * @apiParam {String} altid the alternate ID of the user
   * @apiParam {Object} userdata arbitrary user data
   *
   *  @apiUse MissingUsername
   *  @apiUse ServerError
   *  @apiUse updateUserSuccessExample
   */
  server.post(u('updateUser'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!req.params.username) {
        return next(new restify.InvalidArgumentError('You must provide a username.'));
      }
      api.user.updateUser(req.keyspace, user, req.params.username, req.params.altid, req.params.userdata, _response(res, next));
    });
  });

  /**
   * @api {get} /username/:username Get a specific user
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/username/cliftonc
   *
   * @apiParam {String} username The name of the user
   *
   *  @apiUse getUserByNameSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByName'), api.auth.checkRequest, function (req, res, next) {
    api.user.getUserByName(req.keyspace, req.params.username, _response(res, next));
  });

  /**
   * @api {post} /user Add a user
   * @apiName Users
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new user.
   * @apiParam {String} username the name of the user
   * @apiParam {String} altid the alternate ID of the user
   * @apiParam {Object} userdata arbitrary user data
   * @apiParam {Object} initialise initialisation command
   *
   * @apiParamExample {json} userdata
   *  {
        avatar: '/image/1.jpg',
        fullName: 'Clifton Cunningham'
      }
   *
   * @apiParamExample {json} initialise
   *  {
        follow: {
          users: ['bob', 'cliftonc'],
          backfill: '1d',
          visibility: 'personal'
        }
      }
   *
   * @apiExample {curl} Example usage:
   *     curl --data 'username=cliftonc' http://localhost:3000/user
   *
   *  @apiUse MissingUsername
   *  @apiUse ServerError
   *  @apiUse addUserSuccessExample
   */
  server.post(u('addUser'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.username) {
      return next(new restify.InvalidArgumentError('You must provide a username.'));
    }
    var options = {
      initialise: req.params.initialise,
      userid: req.params.userid,
      userdata: req.params.userdata
    };
    api.user.addUser(req.keyspace, req.params.username, req.params.altid, options, _response(res, next));
  });

  /**
   * @api {get} /user/:id Get a specific user by id
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by id
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUser'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User not found'})); }
      api.user.getUser(req.keyspace, user, _response(res, next));
    });
  });

  /**
   * @api {get} /useraltid/:id Get a specific user by altid
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by altid
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/useraltid/1234
   *
   * @apiParam {String} id The alternate id of the user as a string
   * @apiUse getUserByAltIdSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByAltId'), api.auth.checkRequest, function (req, res, next) {
    api.user.getUserByAltId(req.keyspace, req.params.altid, _response(res, next));
  });

  /**
   * @api {get} /user/:id/relationship Get details of a relationship
   * @apiName GetUserRelationship
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription
   *
   * Retrieves details of a specific user relationship with the current logged in user, intended to be used
   * when viewing someone elses profile.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452/relationship
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserRelationshipSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserRelationship'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.user.getUserRelationship(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

  /**
   * @apiDefine ApiLikes Likes
   *
   * This is a collection of methods that allow you to create and retrieve likes.
   */

  /**
   * @api {post} /like Add a like by a user
   * @apiName AddLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new like of an item
   *
   * @apiExample {curl} Example usage:
   *     curl --data 'user=405d7e5e-c028-449c-abad-9c11d8569b8f&item=github.com' http://localhost:3000/like
   *
   * @apiParam {Guid} user the guid representation of the user
   * @apiParam {String} item a canonical url to the item liked
   * @apiUse addLikeSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingItem
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.post(u('addLike'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.item) {
      return next(new restify.InvalidArgumentError('You must provide an item.'));
    }
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.like.addLike(req.keyspace, user, req.params.item, api.client.getTimestamp(), _response(res, next));
    });
  });

  /**
   * @api {get} /like/:like Get a specific like
   * @apiName GetLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific like
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} post The guid of the like
   * @apiUse getLikeSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getLike'), api.auth.checkRequest, function (req, res, next) {
    api.like.getLike(req.keyspace, req.params.like, _response(res, next));
  });

  /**
   * @api {get} /user/:user/like/:item Check a specific like
   * @apiName CheckLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Checks if a user likes a specific item, typically the item is a canonical url.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse checkLikeSuccessExample
   * @apiUse checkNotLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('checkLike'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.like.checkLike(req.keyspace, user, encodeURIComponent(req.params.item), _response(res, next));
    });
  });

  /**
   * @api {delete} /user/:user/like/:item Remove a like.
   * @apiName RemoveLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a like
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse removeLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.del(u('removeLike'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.item) {
      return next(new restify.InvalidArgumentError('You must provide an item.'));
    }
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (req.liu.user.toString() !== user.toString()) {
        return next(new restify.ForbiddenError('You cant delete someone elses like.'));
      }
      api.like.removeLike(req.keyspace, req.liu.user, encodeURIComponent(req.params.item), _response(res, next));
    });
  });

  /**
   * @apiDefine ApiPosts Posts
   *
   * This is a collection of methods that allow you to create and retrieve posts.
   */

  /**
   * @api {post} /post Add a post by a user
   * @apiName AddPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new post, by default all new posts are public, and so can be seen by all users.
   * @apiParam {String} user of the user
   * @apiParam {String} content of the post
   * @apiParam {String} content_type the type of content in content, use application/json for json data, defaults to text/html
   * @apiParam {Timestamp} posted the timestamp that the post occurred - default Date.now()
   * @apiParam {String} visibility is the post private, e.g. only for friends
   * @apiUse addPostSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingContent
   *  @apiUse ServerError
   */
  server.post(u('addPost'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.content) {
      return next(new restify.InvalidArgumentError('You must provide content for the post.'));
    }
    var visibility = req.params.visibility || null,
      content_type = req.params.content_type || 'text/html',
      posted = api.client.getTimestamp(req.params.posted);

    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.post.addPost(req.keyspace, user, req.params.content, content_type, posted, visibility, req.params.altid, _response(res, next));
    });
  });

  /**
   * @api {post} /post/:post Update a post by a user
   * @apiName UpdatePost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Updates a post.
   * @apiParam {Guid} post the guid for the post
   * @apiParam {String} content of the post
   * @apiParam {String} content_type the type of content in content, use application/json for json data, defaults to text/html
   * @apiParam {String} private is the post private, e.g. only for friends
   * @apiUse updatePostSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingContent
   *  @apiUse ServerError
   */
  server.post(u('updatePost'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.post) {
      return next(new restify.InvalidArgumentError('You must provide a guid for the post.'));
    }

    if (!req.params.content) {
      return next(new restify.InvalidArgumentError('You must provide content for the post.'));
    }

    api.post.getPost(req.keyspace, req.liu.user, req.params.post, function (err, post) {

      if (err) { return next(_error(err)); }

      if (post.user.user.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only update your own posts.'));
      }

      var visibility = req.params.visibility || post.visibility,
          content_type = req.params.content_type || post.content_type;

      api.post.updatePost(req.keyspace, req.params.post, req.params.content, content_type, visibility, _response(res, next));

    });
  });

  /**
   * @api {post} /post/:altid/altid Update a post by a user by altid
   * @apiName UpdatePostByAltid
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Updates a post by altid
   * @apiParam {String} altid the altid for the post
   * @apiParam {String} content of the post
   * @apiParam {String} content_type the type of content in content, use application/json for json data, defaults to text/html
   * @apiParam {String} private is the post private, e.g. only for friends
   * @apiUse updatePostSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingContent
   *  @apiUse ServerError
   */
  server.post(u('updatePostByAltid'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.altid) {
      return next(new restify.InvalidArgumentError('You must provide a altid for the post.'));
    }

    if (!req.params.content) {
      return next(new restify.InvalidArgumentError('You must provide content for the post.'));
    }

    api.post.getPostByAltid(req.keyspace, req.liu.user, req.params.altid, function (err, post) {

      if (err) { return next(_error(err)); }
      if (post.user.user.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only update your own posts.'));
      }

      var visibility = req.params.visibility || post.visibility,
          content_type = req.params.content_type || post.content_type;

      api.post.updatePost(req.keyspace, post.post, req.params.content, content_type, visibility, _response(res, next));

    });
  });

  /**
   * @api {get} /post/:post Get a specific post
   * @apiName GetPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific post
   * @apiParam {Guid} post The guid of the post
   * @apiUse getPostSuccessExample
   *
   *  @apiUse ServerError
   */
  server.get(u('getPost'), api.auth.checkRequest, function (req, res, next) {
    api.post.getPost(req.keyspace, req.liu.user, req.params.post, _response(res, next));
  });

  /**
   * @api {get} /post/:altid/altid Get a specific post by altid
   * @apiName GetPostByAltid
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific post by altid
   * @apiParam {String} altid The altid of the post
   * @apiUse getPostSuccessExample
   *
   *  @apiUse ServerError
   */
  server.get(u('getPostByAltid'), api.auth.checkRequest, function (req, res, next) {
    api.post.getPostByAltid(req.keyspace, req.liu.user, req.params.altid, _response(res, next));
  });

  /**
   * @api {delete} /post/:post Remove a post.
   * @apiName RemovePost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a post
   * @apiParam {String} post the guid representation of the post
   * @apiUse removePostSuccessExample
   *
   *  @apiUse MissingPost
   *  @apiUse ServerError
   */
  server.del(u('removePost'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.post) {
      return next(new restify.InvalidArgumentError('You must provide a post guid.'));
    }
    api.post.removePost(req.keyspace, req.liu.user, req.params.post, _response(res, next));
  });

  /**
   * @api {delete} /post/:altid/altid Remove a post by altid
   * @apiName RemovePostByAltid
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a post by altid
   * @apiParam {String} post the altid representation of the post
   * @apiUse removePostSuccessExample
   *
   *  @apiUse MissingPost
   *  @apiUse ServerError
   */
  server.del(u('removePostByAltid'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.altid) {
      return next(new restify.InvalidArgumentError('You must provide a post altid.'));
    }
    api.post.removePostByAltid(req.keyspace, req.liu.user, req.params.altid, _response(res, next));
  });

  /**
   * @api {get} /friend/:friend Get friend
   * @apiName GetFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a specific relationship information
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriend'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.friend, function (err, friend) {
      if (err) { return next(_error(err)); }
      api.friend.getFriend(req.keyspace, req.liu.user, friend, _response(res, next));
    });
  });

  /**
   * @api {get} /user/:user/friends Get friends for a user
   * @apiName GetFriends
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of friends for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendsSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriends'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.friend.getFriends(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

  /**
   * @api {delete} /user/:user/friend/:user_friend Remove a friendship.
   * @apiName RemoveFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a friendship (both sides)
   * @apiParam {String} user the guid representation of the user
   * @apiParam {String} user_friend the guid representation of the user they dont want to be friends with
   * @apiUse removeFriendSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.del(u('removeFriend'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user guid.'));
    }
    if (!req.params.user_friend) {
      return next(new restify.InvalidArgumentError('You must provide a user_friend guid.'));
    }
    coerce(req.keyspace, [req.params.user, req.params.user_friend], function (err, users) {
      if (err) { return next(_error(err)); }
      var user = users[0], user_friend = users[1];
      if (user.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only remove your own friendships.'));
      }
      api.friend.removeFriend(req.keyspace, user, user_friend, _response(res, next));
    });
  });

  /**
   * @apiDefine ApiFriendRequests Friend Requests
   *
   * This is a collection of methods that allow you to use the friend request workflow (instead of creating friends automatically).
   */
  /**
   * @api {post} /friend-request Submit a new friend request
   * @apiName AddFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend request.
   * @apiParam {String} user_friend the guid of the user to become friends with
   * @apiParam {String} message the message to leave
   * @apiUse addFriendRequestSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('addFriendRequest'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user_friend) {
      return next(new restify.InvalidArgumentError('You must provide a user_friend id.'));
    }
    coerce(req.keyspace, req.params.user_friend, function (err, user_friend) {
      if (err) { return next(_error(err)); }
      api.friend.addFriendRequest(req.keyspace, req.liu.user, user_friend, req.params.message || '', api.client.getTimestamp(), _response(res, next));
    });
  });

  /**
   * @api {get} /friend-request/active Get active friend requests
   * @apiName GetFriendRequests
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves active friend Requests for logged in user (inbound and outbound)
   * @apiUse getFriendRequestsSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriendRequests'), api.auth.checkRequest, function (req, res, next) {
    if (!req.liu.user) {
      return next(new restify.UnauthorizedError('You must be logged in to access a friend request list.'));
    }
    api.friend.getFriendRequests(req.keyspace, req.liu.user, _response(res, next));
  });

  /**
   * @api {post} /friend-request/accept Accept a friend request
   * @apiName AcceptFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Accepts a friend request.
   * @apiParam {String} friend_request the guid of the user to become friends with
   * @apiUse acceptFriendRequestSuccessExample

   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('acceptFriendRequest'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.friend_request) {
      return next(new restify.InvalidArgumentError('You must provide a friend_request guid.'));
    }
    api.friend.acceptFriendRequest(req.keyspace, req.liu.user, req.params.friend_request, _response(res, next));
  });

  /**
   * @apiDefine ApiFollowers Followers
   *
   * This is a collection of methods that allow you to create and retrieve follows.
   */

  /**
   * @api {post} /follow Add a follower to a user
   * @apiName AddFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend to a user account.
   * @apiParam {Guid} user the guid representation of the user who will be followed
   * @apiParam {Guid} user_follower the guid of the user who will be the follower
   * @apiParam {String} visibility visibility level
   * @apiParam {String} backfill amount of time to backfill posts from the user followed - e.g. 1d
   * @apiUse followUserSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.post(u('addFollower'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.user_follower) {
      return next(new restify.InvalidArgumentError('You must provide a user_follower.'));
    }

    var visibility = req.params.visibility || null,
      backfill = req.params.backfill;

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function (err, users) {
      if (err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if (user_follower.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only add your own follow relationships.'));
      }

      api.follow.addFollower(req.keyspace, user, user_follower, api.client.getTimestamp(), visibility, backfill, _response(res, next));
    });

  });

  /**
   * @api {get} /user/:user/followers Get followers for a user
   * @apiName GetFollowers
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} username the username of the user
   * @apiUse getFollowersSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollowers'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.follow.getFollowers(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

  /**
   * @api {get} /followers/:follow Get follow details
   * @apiName GetFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific follow
   * @apiParam {Guid} follow the guid of a specific follow
   * @apiUse getFollowSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollow'), api.auth.checkRequest, function (req, res, next) {
    api.follow.getFollow(req.keyspace, req.liu.user, req.params.follow, _response(res, next));
  });

  /**
   * @api {delete} /user/:user/follower/:user_follower Stop following a user.
   * @apiName RemoveFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a follow
   * @apiParam {String} user the user guid who is currently being followed
   * @apiParam {String} user_follower the user who will stop following the first user
   * @apiUse unFollowUserSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.del(u('removeFollower'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user id.'));
    }
    if (!req.params.user_follower) {
      return next(new restify.InvalidArgumentError('You must provide a user_follower id.'));
    }

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function (err, users) {

      if (err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if (user_follower.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only remove your own follow relationships.'));
      }
      api.follow.removeFollower(req.keyspace, user, user_follower, _response(res, next));

    });

  });

  /**
   * @apiDefine ApiFeeds Feeds
   *
   * This is a collection of methods that allow you to retrieve the news feed for a user.
   */

  /**
   * @api {get} /feed/:user Get a feed for a user
   * @apiName GetFeed
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFeedSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFeed'), api.auth.checkRequest, function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User ' + req.params.user + ' not found!'})); }
      api.feed.getFeed(req.keyspace, req.liu.user, user, start, limit, function (err, feed, more) {
        if (err) { return next(_error(err)); }
        res.send({feed: feed, more: more});
      });
    });
  });

  /**
   * @api {get} /feed/:user/direct Get a direct feed for a user
   * @apiName GetFeedDirect
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user that are directly posted to their feed, so not including items that come via follows or mentions.
   * @apiParam {String} user the guid of the user
   * @apiUse getUserFeedSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserFeed'), api.auth.checkRequest, function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User ' + req.params.user + ' not found!'})); }
      api.feed.getUserFeed(req.keyspace, req.liu.user, user, start, limit, function (err, feed, more) {
        if (err) { return next(_error(err)); }
        res.send({feed: feed, more: more});
      });
    });
  });

  next(null, server);

}

/* istanbul ignore if */
if (require.main === module) {

  var config = require('./config')();
  require('seguir')(config, function (err, api) {
    if (err) { return process.exit(0); }
    bootstrapServer(api, config, function (err, server) {
      if (err) {
        console.log('Unable to bootstrap server: ' + err.message);
        return;
      }
      server.listen(config.port || 3000, function () {
        console.log('Server %s listening at %s', server.name, server.url);
      });
    });
  });

} else {
  module.exports = function (config, next) {
    require('seguir')(config, function (err, api) {
      if (err) {
        return next(new Error('Unable to bootstrap API: ' + err.message));
      }
      return bootstrapServer(api, config, next);
    });
  };
}

/**
 * @apiDefine MissingUser
 * @apiError (4xx) BadRequestError You did not provide a guid for the user
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a user guid.'
 *     }
 */

/**
 * @apiDefine MissingUsername
 * @apiError (4xx) BadRequestError You did not provide a username
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a username.'
 *     }
 */

/**
 * @apiDefine MissingPost
 * @apiError (4xx) BadRequestError You did not provide a post guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a post guid.'
 *     }
 */

/**
 * @apiDefine MissingFriend
 * @apiError (4xx) BadRequestError You did not provide a friend guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a friend guid.'
 *     }
 */

/**
 * @apiDefine MissingFollow
 * @apiError (4xx) BadRequestError You did not provide a follow guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a follow guid.'
 *     }
 */

/**
 * @apiDefine MissingItem
 * @apiError (4xx) BadRequestError You did not provide an item to check
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide an item.'
 *     }
 */

/**
 * @apiDefine MissingContent
 * @apiError (4xx) BadRequestError You did not provide content for the post
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide content for the post.'
 *     }
 */

/**
 * @apiDefine UserNotFound
 * @apiError (4xx) NotFoundError The user was not found.
 * @apiErrorExample Not-Found:
 *     HTTP/1.1 404 Not Found
 *     {
 *       'code': 'NotFoundError',
 *       'message': 'Could not find that user.'
 *     }
 */

/**
 * @apiDefine ServerError
 * @apiError (5xx) ServerError There was a server problem.
 * @apiErrorExample Server-Error:
 *     HTTP/1.1 500 Server Error
 *     {
 *       'code': 'NotFoundError',
 *       'message': 'Something specific about the server error'
 *     }
 */

// MARKER: Samples
/**
 * @apiDefine addUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByNameSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "22f8964d-d58a-4f99-ae45-260bc1efafd6",
  "username": "evil &user <alert>name</alert>",
  "altid": "9",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByAltIdSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine updateUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "b60490c5-ac89-4d53-940e-0959a390dcf1",
  "username": "new_name",
  "altid": "new_altid",
  "userdata": {
    "hello": "world"
  }
}
 */
/**
 * @apiDefine addFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend_request": "944b176a-b8f1-4bce-82a3-4d8676b60241",
  "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
  "user_friend": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
  "message": "Please be my friend",
  "since": "2015-09-05T12:52:24.550Z",
  "visibility": "private"
}
 */
/**
 * @apiDefine getFriendRequestsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "incoming": [],
  "outgoing": [
    {
      "friend_request": "944b176a-b8f1-4bce-82a3-4d8676b60241",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "message": "Please be my friend",
      "since": "2015-09-05T12:52:24.550Z",
      "visibility": "private"
    }
  ]
}
 */
/**
 * @apiDefine acceptFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "1bc50328-99d5-44dd-be9d-0d22fc4db3d5",
  "reciprocal": "54f9e7a9-282a-41cf-96e1-70ebc80a574a",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_friend": {
    "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:24.604Z"
}
 */
/**
 * @apiDefine getFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "1bc50328-99d5-44dd-be9d-0d22fc4db3d5",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_friend": {
    "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:24.604Z",
  "visibility": "private"
}
 */
/**
 * @apiDefine getFriendsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "user_friend": {
      "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-09-05T12:52:24.604Z"
  }
]
 */
/**
 * @apiDefine removeFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine followUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_follower": {
    "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:24.810Z",
  "visibility": "public"
}
 */
/**
 * @apiDefine getFollowSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_follower": {
    "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:24.810Z",
  "visibility": "public"
}
 */
/**
 * @apiDefine getFollowersSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "follow": "57f8a82c-1a24-46ef-a670-ee086115e6ed",
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "user_follower": {
      "user": "97cbd3c8-9adb-4dbc-86e5-e10c33db10c9",
      "username": "ted",
      "altid": "3",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-09-05T12:52:24.857Z",
    "visibility": "public",
    "followerCount": 1,
    "liuIsFollowing": false,
    "liuIsUser": false
  },
  {
    "follow": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "user_follower": {
      "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-09-05T12:52:24.810Z",
    "visibility": "public",
    "followerCount": 0,
    "liuIsFollowing": false,
    "liuIsUser": false
  }
]
 */
/**
 * @apiDefine unFollowUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine getPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "88c1de8e-143d-4995-ada3-bd106cba1547",
  "content": "Hello, this is a post",
  "content_type": "text/html",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "posted": "2015-09-05T12:52:25.030Z",
  "visibility": "public",
  "altid": "ALTID"
}
 */
/**
 * @apiDefine removePostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine addPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "3a0ee577-239f-42e1-ad2e-b5206878bea9",
  "user": {
    "user": "b60490c5-ac89-4d53-940e-0959a390dcf1",
    "username": "new_name",
    "altid": "new_altid",
    "userdata": {
      "hello": "world"
    }
  },
  "content": {
    "hello": "world"
  },
  "content_type": "application/json",
  "posted": "2015-09-05T12:52:25.172Z",
  "visibility": "public",
  "altid": null
}
 */
/**
 * @apiDefine updatePostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "updated"
}
 */
/**
 * @apiDefine addLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "e9cca9a0-7551-4a91-a1b0-51f9218c89d1",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "item": "http%3A%2F%2Fgithub.com",
  "since": "2015-09-05T12:52:25.296Z",
  "visibility": "public"
}
 */
/**
 * @apiDefine getLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "e9cca9a0-7551-4a91-a1b0-51f9218c89d1",
  "item": "http%3A%2F%2Fgithub.com",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:25.296Z",
  "visibility": "public"
}
 */
/**
 * @apiDefine checkLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "e9cca9a0-7551-4a91-a1b0-51f9218c89d1",
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-09-05T12:52:25.296Z",
  "visibility": "public",
  "userLikes": true,
  "count": 1
}
 */
/**
 * @apiDefine removeLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine checkNotLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "userLikes": false,
  "user": {
    "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "count": 0
}
 */
/**
 * @apiDefine getFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "feed": [
    {
      "like": "e9cca9a0-7551-4a91-a1b0-51f9218c89d1",
      "item": "http%3A%2F%2Fgithub.com",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-09-05T12:52:25.296Z",
      "visibility": "public",
      "_item": "e9cca9a0-7551-4a91-a1b0-51f9218c89d1",
      "type": "like",
      "timeuuid": "f4f77513-53cc-11e5-97ba-830ad0811db6",
      "date": "2015-09-05T12:52:25.296Z",
      "fromNow": "a few seconds ago",
      "isPrivate": false,
      "isPersonal": false,
      "isPublic": true,
      "fromSomeoneYouFollow": false,
      "isLike": true,
      "isPost": false,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true,
      "isFollower": false
    },
    {
      "post": "88c1de8e-143d-4995-ada3-bd106cba1547",
      "content": "CHANGED AGAIN!",
      "content_type": "text/html",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2015-09-05T12:52:25.030Z",
      "visibility": "public",
      "altid": "ALTID",
      "_item": "88c1de8e-143d-4995-ada3-bd106cba1547",
      "type": "post",
      "timeuuid": "f4cede6d-53cc-11e5-ab79-b1144c585b64",
      "date": "2015-09-05T12:52:25.030Z",
      "fromNow": "a few seconds ago",
      "isPrivate": false,
      "isPersonal": false,
      "isPublic": true,
      "fromSomeoneYouFollow": false,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true,
      "isFollower": false
    },
    {
      "follow": "57f8a82c-1a24-46ef-a670-ee086115e6ed",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "97cbd3c8-9adb-4dbc-86e5-e10c33db10c9",
        "username": "ted",
        "altid": "3",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-09-05T12:52:24.857Z",
      "visibility": "public",
      "_item": "57f8a82c-1a24-46ef-a670-ee086115e6ed",
      "type": "follow",
      "timeuuid": "f4b5d827-53cc-11e5-88f8-d650689effbf",
      "date": "2015-09-05T12:52:24.866Z",
      "fromNow": "a few seconds ago",
      "isPrivate": false,
      "isPersonal": false,
      "isPublic": true,
      "fromSomeoneYouFollow": false,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true,
      "isFollower": false
    },
    {
      "follow": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-09-05T12:52:24.810Z",
      "visibility": "public",
      "_item": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
      "type": "follow",
      "timeuuid": "f4afbda5-53cc-11e5-817e-8aeeaf98f4b1",
      "date": "2015-09-05T12:52:24.826Z",
      "fromNow": "a few seconds ago",
      "isPrivate": false,
      "isPersonal": false,
      "isPublic": true,
      "fromSomeoneYouFollow": false,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true,
      "isFollower": false
    },
    {
      "friend": "1bc50328-99d5-44dd-be9d-0d22fc4db3d5",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-09-05T12:52:24.604Z",
      "visibility": "personal",
      "_item": "1bc50328-99d5-44dd-be9d-0d22fc4db3d5",
      "type": "friend",
      "timeuuid": "f48dddc1-53cc-11e5-9c8e-65db57163ca9",
      "date": "2015-09-05T12:52:24.604Z",
      "fromNow": "a few seconds ago",
      "isPrivate": false,
      "isPersonal": true,
      "isPublic": false,
      "fromSomeoneYouFollow": false,
      "isLike": false,
      "isPost": false,
      "isFollow": false,
      "isFriend": true,
      "isUsersItem": true,
      "isFollower": false
    },
    {
      "post": "8519f2df-9d7a-4114-9c32-188cb3d26d1e",
      "content": "Hello, this is a private post",
      "content_type": "text/html",
      "user": {
        "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2010-07-28T06:01:00.145Z",
      "visibility": "private",
      "altid": null,
      "_item": "8519f2df-9d7a-4114-9c32-188cb3d26d1e",
      "type": "post",
      "timeuuid": "7f10961e-9a0d-11df-b984-b653fc713e01",
      "date": "2010-07-28T06:01:00.145Z",
      "fromNow": "5 years ago",
      "isPrivate": true,
      "isPersonal": false,
      "isPublic": false,
      "fromSomeoneYouFollow": false,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true,
      "isFollower": false
    }
  ],
  "more": null
}
 */
/**
 * @apiDefine getUserFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "follow": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
    "user": {
      "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
      "username": "cliftonc",
      "altid": "1",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "user_follower": {
      "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-09-05T12:52:24.810Z",
    "visibility": "public",
    "_item": "9b1c9482-0fdc-4bc7-9663-a5616c8afead",
    "type": "follow",
    "timeuuid": "f4b032d6-53cc-11e5-b03b-b3d71c3d6832",
    "date": "2015-09-05T12:52:24.829Z",
    "fromNow": "a few seconds ago",
    "isPrivate": false,
    "isPersonal": false,
    "isPublic": true,
    "fromSomeoneYouFollow": true,
    "isLike": false,
    "isPost": false,
    "isFollow": true,
    "isFriend": false,
    "isUsersItem": true,
    "isFollower": false
  },
  {
    "friend": "54f9e7a9-282a-41cf-96e1-70ebc80a574a",
    "user": {
      "user": "1a63823e-0818-4850-bd3e-7ef76f9a053d",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "user_friend": {
      "user": "3dee9e50-4d62-44ca-97c0-5c22cf56216c",
      "username": "cliftonc",
      "altid": "1",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-09-05T12:52:24.604Z",
    "visibility": "personal",
    "_item": "54f9e7a9-282a-41cf-96e1-70ebc80a574a",
    "type": "friend",
    "timeuuid": "f48dddc2-53cc-11e5-b3ff-d5d0425b6a3a",
    "date": "2015-09-05T12:52:24.604Z",
    "fromNow": "a few seconds ago",
    "isPrivate": false,
    "isPersonal": true,
    "isPublic": false,
    "fromSomeoneYouFollow": false,
    "isLike": false,
    "isPost": false,
    "isFollow": false,
    "isFriend": true,
    "isUsersItem": false,
    "isFollower": false
  }
]
 */
/**
 * @apiDefine getUserRelationshipSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "isFriend": true,
  "isFriendSince": "2015-09-05T12:52:24.604Z",
  "isFriendRequestPending": false,
  "isFriendRequestSince": null,
  "youFollow": false,
  "youFollowSince": null,
  "youFollowPrivate": false,
  "youFollowPersonal": false,
  "theyFollow": true,
  "theyFollowSince": "2015-09-05T12:52:24.810Z",
  "theyFollowVisibility": "public",
  "theyFollowPrivate": false,
  "theyFollowPersonal": false,
  "inCommon": [],
  "followerCount": 0
}
 */
