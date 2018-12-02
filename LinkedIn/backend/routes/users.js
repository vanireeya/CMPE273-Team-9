var express = require('express');
var router = express.Router();
var pool = require('../connections/mysql')
var mysql = require('mysql')
var mongoose = require('mongoose');

var { mongoose } = require('../connections/mongo');

var kafka = require('../kafka/client');

//var { User } = require('../models/userInfo');
var bcrypt = require('bcryptjs')
var UserInfo = require('../models/userInfo')//.users
var Job = require('../models/job')

const redis = require('redis');
const client = redis.createClient();

var redisClient = require('redis').createClient;
var redis1 = redisClient(6379, 'localhost');



// create redis middleware
let redisMiddleware = (req, res, next) => {
  let key = "__expIress__" + req.originalUrl || req.url;
  console.log("redis call")
  client.get(key, function (err, reply) {
    if (reply) {
      console.log("____reply____", reply)
      res.send(reply);
    } else {
      res.sendResponse = res.send;
      res.send = (body) => {
        client.set(key, JSON.stringify(body));
        res.sendResponse(body);
      }
      next();
    }
  });
};


/* User Sign up */
router.post('/', async function (req, res, next) {

  console.log('\n\nIn user signup');
  console.log("Request Got: ", req.body)
  const email = req.body.email
  const pwd = bcrypt.hashSync(req.body.pwd, 10)
  const firstName = req.body.firstName
  const lastName = req.body.lastName
  const type = req.body.type

  pool.getConnection((
    err, connection) => {
    if (connection) {
      console.log("Connection obtained")
      const sql = `insert into userinfo(email,pwd,firstName,lastName,type) values(${mysql.escape(email)},${mysql.escape(pwd)},${mysql.escape(firstName)},${mysql.escape(lastName)},${mysql.escape(type)})`
      connection.query(sql,
        (err, result) => {
          if (result) {
            console.log("Successfully registered")

            //mongo query here
            var user = new UserInfo({
              fname: firstName,
              lname: lastName,
              type: type,
              email: email,
              password: pwd
            })
            console.log(`user ${user}`);
            user.save().then(user => {
              console.log("user created in mongo");
              // console.log(`user in then is ${user}`);

              res.writeHead(200, {
                'Content-Type': 'application/json'
              })
              const data = {
                "status": 1,
                "msg": "Successfully Signed Up",
                "info": {
                  "id": result.insertId,
                  "fullname": firstName + " " + lastName,
                  "type": type,
                  "email": email
                }
              }
              console.log("data being sent to frontend:\n", JSON.stringify(data))
              res.end(JSON.stringify(data))


            }, (err) => {
              console.log("__________err___________", err)
              console.log(`Signup Failed in mongo`);
              console.log("User already exists ", err.sqlMessage)
              res.writeHead(200, {
                'Content-Type': 'application/json'
              })
              const data = {
                "status": 0,
                "msg": err.errmsg,
                "info": {
                  "error": err.errmsg
                }
              }
              console.log("data being sent to frontend:\n", JSON.stringify(data))
              res.end(JSON.stringify(data))


            })

          } else if (err) {
            console.log("User already exists ", err.sqlMessage)
            res.writeHead(200, {
              'Content-Type': 'application/json'
            })
            const data = {
              "status": 0,
              "msg": "User already exists",
              "info": {
                "error": err.sqlMessage
              }
            }
            console.log("data being sent to frontend:\n", JSON.stringify(data))
            res.end(JSON.stringify(data))
          }
        })
    } else {
      console.log("Connection Refused ", err)
      res.writeHead(400, {
        'Content-Type': 'text/plain'
      })
      res.end("Connection Refused")
    }

  })

});

/*
 User Login  with redis cache
*/
router.post('/login', redisMiddleware, async function (req, res, next) {

  console.log('\n\nIn user login');
  console.log("Request Got: ", req.body)
  const email = req.body.email
  const pwd = req.body.pwd;
  console.log("_______pwd_______", pwd)

  pool.getConnection((
    err, connection) => {
    if (connection) {
      console.log("Connection obtained for Login")
      const sql = "select * from userinfo WHERE email = " + mysql.escape(email);
      connection.query(sql,
        (err, result) => {
          console.log("______result______", result);
          const password = bcrypt.compareSync(pwd, result[0].pwd);
          if (result && password) {
            console.log("Successfully Logged In")
            res.writeHead(200, {
              'Content-Type': 'application/json'
            })
            const data = {
              "status": 1,
              "msg": "Successfully Logged In",
              "info": {
                "fullname": result[0].firstName + " " + result[0].lastName,
                "email": email,
                "type": result[0].type
              }
            }
            console.log("data being sent to frontend:\n", JSON.stringify(data))
            res.end(JSON.stringify(data))
          } else if (err) {
            console.log("Some error in sql query", err.sqlMessage)
            res.writeHead(400, {
              'Content-Type': 'application/json'
            })

            res.end("some error in sql query")
          } else {
            //password doesn't match
            console.log("Password doesn't match!")
            res.writeHead(200, {
              'Content-Type': 'application/json'
            })
            const data = {
              "status": 0,
              "msg": "Error in login,Incorrect  password",
              "info": {}
            }
            console.log("data being sent to frontend:\n", JSON.stringify(data))
            res.end(JSON.stringify(data))

          }
        })
    } else {
      console.log("Connection Refused ", err)
      res.writeHead(400, {
        'Content-Type': 'text/plain'
      })
      res.end("Connection Refused")
    }
  })
});

/**
 * delete a user
 */
router.delete("/:userID", async function (req, res, next) {
  console.log('\n\nIn user Delete');
  console.log("Request Got: ", req.body);


  const email = req.body.email;
  const userID = req.params.userID;

  pool.getConnection((
    err, connection) => {
    if (connection) {
      console.log("Connection obtained")
      const sql = "DELETE FROM userinfo WHERE email=" + mysql.escape(email);
      console.log("\nSQL QUERY: " + sql);
      connection.query(sql,
        (err, result) => {
          if (result) {
            console.log("Successfully deleted from MySQL");
            //mongo query here
            try {
              UserInfo.remove({ "_id": userID })
                .exec()
                .then(result => {
                  console.log("\nSuccessfully deleted from MongoDB");

                  res.writeHead(200, {
                    'Content-Type': 'application/json'
                  })
                  const data = {
                    "status": 1,
                    "msg": "Successfully deleted",
                    "info": result
                  }
                  res.end(JSON.stringify(data))
                })
                .catch(err => {
                  console.log("\nNo Such User");
                  res.writeHead(200, {
                    'Content-Type': 'application/json'
                  })
                  const data = {
                    "status": 0,
                    "msg": "No Such User",
                    "info": {
                      "error": err
                    }
                  }
                  res.end(JSON.stringify(data))
                })
            } catch (error) {
              console.log("\nError in query.");

              res.writeHead(400, {
                'Content-Type': 'application/json'
              })
              const data = {
                "status": 0,
                "msg": error,
                "info": {
                  "error": error
                }
              }
              res.end(JSON.stringify(data))
            }

          } else if (err) {
            console.log("User already exists ", err.sqlMessage)
            res.writeHead(200, {
              'Content-Type': 'application/json'
            })
            const data = {
              "status": 0,
              "msg": "User already exists",
              "info": {
                "error": err.sqlMessage
              }
            }
            console.log("data being sent to frontend:\n", JSON.stringify(data))
            res.end(JSON.stringify(data))
          }
        })
    } else {
      console.log("Connection Refused ", err)
      res.writeHead(400, {
        'Content-Type': 'text/plain'
      })
      res.end("Connection Refused")
    }

  })

});

/*
* apply for a job
*/
router.post("/:userID/apply", async function (req, res, next) {
  console.log("Inside post apply of job.")

  const data = {
    userId: req.params.userID,
    jobId: req.body.jobId,
    howDidyouHear: req.body.howDidyouHear,
    isDisabled: req.body.isDisabled,
    resume: req.body.resume,
    ethnicity: req.body.ethnicity
  }

  kafka.make_request("userJobApply", data, function (err, result) {
    if (err) {
      const data = {
        "status": 0,
        "msg": "Error while applying to job",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully applied to a job",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})


/*
saving a job
*/
router.post("/:userID/save", async function (req, res, next) {
  console.log("Inside post of job save.")

  const data = {
    jobId: req.body.jobId,
    userId: req.params.userID
  }


  kafka.make_request('userJobSave', data, function (err, result) {
    console.log(err && err)
    console.log(result && result)
    if (err) {
      const data = {
        "status": 0,
        "msg": "Error while saving a job",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else if (result == "Already saved a job") {
      const data = {
        "status": 0,
        "msg": "Already saved a job",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully saved a job",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})

/*
 * get all jobs listed by that user
 */
getAllJobsPostedByUser_Caching = function (UserInfo, redis1, userID, callback) {
  redis1.get(userID, function (err, reply) {
    if (err) callback(null);
    else if (reply) {
      console.log("___________________________from cache_______________________________")
      console.log(reply)
      callback(JSON.parse(reply));
    } //user exists in cache

    else {
      //user doesn't exist in cache - we need to query the main database
      // const userID = req.params.userID

      try {
        Job.find({
          postedBy: userID
        })
          .exec()
          .then(result => {
            console.log("The received result is : ", result);
            // res.writeHead(200, {
            //   'Content-Type': 'application/json'
            // })
            // const data = {
            //   "status": 1,
            //   "msg": "Successfully obtained Job List",
            //   "info": result
            // }
            // res.end(JSON.stringify(data))

            redis1.set(userID, JSON.stringify(result), function () {
              console.log("_____________setting in cache_________________ ")
              callback(result);
            });
          })
          .catch(err => {
            // res.writeHead(200, {
            //   'Content-Type': 'application/json'
            // })
            // const data = {
            //   "status": 0,
            //   "msg": "No Such User",
            //   "info": {
            //     "error": err
            //   }
            // }
            // res.end(JSON.stringify(data))
            callback(err);
          })
      } catch (error) {
        // res.writeHead(400, {
        //   'Content-Type': 'application/json'
        // })
        // const data = {
        //   "status": 0,
        //   "msg": error,
        //   "info": {
        //     "error": error
        //   }
        // }
        // res.end(JSON.stringify(data))
        callback(null);
      }





      // db.collection('text').findOne({
      //     userID: userID
      // }, function (err, doc) {
      //     if (err || !doc) callback(null);
      //     else {
      //       //user_data found in database, save to cache and
      //        // return to client
      //         redis.set(userID, JSON.stringify(doc), function () {
      //             callback(doc);
      //         });
      //     }
      // });

    }
  });
};

router.get("/:userID/joblist", async function (req, res, next) {
  console.log("Inside get joblist. og ")
  const userID = req.params.userID

  if (!userID) {
    // res.status(400).send("Please send a proper userID");
    res.writeHead(200, {
      'Content-Type': 'application/json'
    })
    const data = {
      "status": 0,
      "msg": "No Such User",
      "info": {
        "error": err
      }
    }
    res.end(JSON.stringify(data))
  }
  else {
    getAllJobsPostedByUser_Caching(UserInfo, redis1, req.params.userID, function (user_data) {
      if (!userID) {
        res.status(500).send("Server error");
      }
      else {
        // res.status(200).send(user_data);
        res.writeHead(200, {
          'Content-Type': 'application/json'
        })
        console.log("__________user_data________________-", user_data)
        // const data = {
        //   "status": 1,
        //   "msg": "Successfully obtained Job List",
        //   "info": user_data
        // }
        res.end(JSON.stringify(user_data))

      }
    });
  }





  // try {
  //   UserInfo.findById(userID)
  //     .populate('jobs_posted')
  //     .exec()
  //     .then(result => {
  //       console.log("The received result is : ", result);
  //       res.writeHead(200, {
  //         'Content-Type': 'application/json'
  //       })
  //       const data = {
  //         "status": 1,
  //         "msg": "Successfully obtained Job List",
  //         "info": result
  //       }
  //       res.end(JSON.stringify(data))
  //     })
  //     .catch(err => {
  //       res.writeHead(200, {
  //         'Content-Type': 'application/json'
  //       })
  //       const data = {
  //         "status": 0,
  //         "msg": "No Such User",
  //         "info": {
  //           "error": err
  //         }
  //       }
  //       res.end(JSON.stringify(data))
  //     })
  // } catch (error) {
  //   res.writeHead(400, {
  //     'Content-Type': 'application/json'
  //   })
  //   const data = {
  //     "status": 0,
  //     "msg": error,
  //     "info": {
  //       "error": error
  //     }
  //   }
  //   res.end(JSON.stringify(data))
  // }
});



/**
 * get user details
 */
router.get("/:userId", async function (req, res, next) {

  const data = {
    userId: req.params.userId
  }

  kafka.make_request('getUserDetails', data, function (err, result) {

    if (err) {
      const data = {
        "status": 0,
        "msg": "Error in fetching result",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully fetched details",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})



/**
* search by username
*/
router.post("/search", async function (req, res, next) {

  console.log("inside post request of search by username");
  console.log("req.body", req.body)
  const username = "^" + req.body.username;

  // $or: [{ jobTitle: { $regex: regex_str,$options:'i' } }, { required_skills: { $regex: regex_str,$options:'i' } }],

  UserInfo.find({
    $or: [{ fname: { $regex: username, $options: 'i' } }, { lname: { $regex: username, $options: 'i' } }]
  })
    .then((user, err) => {
      if (err) {

        const data = {
          "status": 0,
          "msg": "No Such Data found",
          "info": {
            "error": err
          }
        }
        res.writeHead(200, {
          'Content-Type': 'application/json'
        })
        res.end(JSON.stringify(data))

      } else {

        console.log("Search query executed successfully");

        console.log("found the list usernames!", user);
        res.writeHead(200, {
          'Content-Type': 'application/json'
        })
        const data = {
          "status": 1,
          "msg": "list of usernames",
          "info": { user }
        }
        console.log("data being sent to frontend:\n", JSON.stringify(data))
        res.end(JSON.stringify(data))

      }
    })
    .catch(err => {

      res.writeHead(400, {
        'Content-Type': 'application/json'
      })
      const data = {
        "status": 0,
        "msg": "Backend Error",
        "info": {
          "error": err
        }
      }
      res.end(JSON.stringify(data))

    })

  // function (err, user) {
  // if (err) {
  //     console.log("error occured")
  //     // callback(err, "login failed");
  //     // console.log("Some error in sql query", err.sqlMessage)
  //     res.writeHead(400, {
  //         'Content-Type': 'application/json'
  //     })

  //     res.end("some error in sql query")

  // }else{
  //     console.log("found the list usernames!",user);
  //     res.writeHead(200, {
  //         'Content-Type': 'application/json'
  //     })
  //     const data = {
  //         "status": 1,
  //         "msg": "list of usernames",
  //         "info": {user}
  //     }
  //     console.log("data being sent to frontend:\n", JSON.stringify(data))
  //     res.end(JSON.stringify(data))
  // }
})


/*
* update user profile
*/
router.put("/:userId", async function (req, res, next) {

  console.log("\nInside user profile updation");
  console.log("Request obtained is : ");
  console.log(JSON.stringify(req.body));

  const data = {
    userId: req.params.userId,
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    headline: req.body.headline,
    address: req.body.address,
    city: req.body.city,
    state: req.body.state,
    country: req.body.country,
    zipcode: req.body.zipcode,
    contact: req.body.contact,
    profile_summary: req.body.profile_summary,
    resume: req.body.resume,
    currentJobDetails: {
      title: req.body.title,
      company: req.body.company,
      location: req.body.location,
      start_workDate: req.body.start_workDate,
      end_workDate: req.body.end_workDate,
      description: req.body.description
    },
    education_data: req.body.education_data,
    experience_data: req.body.experience_data,
    skills_data: req.body.skills_data,
  }

  kafka.make_request('editUserDetails', data, function (err, result) {
    if (err) {
      const data = {
        "status": 0,
        "msg": "Failed updating the details",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else if (result.message) {
      const data = {
        "status": 0,
        "msg": "Failed updating the details",
        "info": result.message
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully updated the details",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})


/**
 * getting jobs saved by the user
 */
router.get("/:userId/savedJobs", async function (req, res, next) {

  console.log("Getting saved jobs for the user: ", req.params.userId)

  const data = {
    userId: req.params.userId
  }

  kafka.make_request('userSavedJobs', data, function (err, result) {
    if (err) {
      const data = {
        "status": 0,
        "msg": "Failed fetching the details of jobs saved",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else if (result.message) {
      const data = {
        "status": 0,
        "msg": "Failed fetching the details of jobs saved",
        "info": result.message
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully fetched the details of all the saved jobs",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})

/**
 * getting list of jobs applied by the user
 */
router.get("/:userId/appliedJobs", async function (req, res, next) {

  console.log("Request to get details of jobs applied by the user: ", req.params.userId)

  const data = {
    userId: req.params.userId
  }

  kafka.make_request('userAppliedJobs', data, function (err, result) {
    if (err) {
      const data = {
        "status": 0,
        "msg": "Failed fetching the details of jobs applied",
        "info": err
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else if (result.message) {
      const data = {
        "status": 0,
        "msg": "Failed fetching the details of jobs applied",
        "info": result.message
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    } else {
      const data = {
        "status": 1,
        "msg": "Successfully fetched the details of all the applied jobs",
        "info": result
      }
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(data))
    }
  })
})



module.exports = router;