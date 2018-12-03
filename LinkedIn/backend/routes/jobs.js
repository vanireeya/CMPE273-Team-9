var express = require('express');
var router = express.Router();
var pool = require('../connections/mysql')
var mysql = require('mysql')
//var { User } = require('../models/userInfo');
var bcrypt = require('bcryptjs')
var UserInfo = require('../models/userInfo') //.users
var Job = require('../models/job')
var Application = require('../models/application')
var kafka = require('../kafka/client')


var redisClient = require('redis').createClient;
var redis = redisClient(6379, 'localhost');

/*
*posting a job
left
*also updating the redis after successful post of a job in the same location and job title 
*/
router.post("/", async function (req, res, next) {

    const data = {
        postedBy: req.body.postedBy,
        jobTitle: req.body.jobTitle,
        description: req.body.description,
        industry: req.body.industry,
        employmentType: req.body.employmentType,
        postedDate: req.body.postedDate,
        location: req.body.location,
        jobFunction: req.body.jobFunction,
        required_skills: req.body.required_skills,
        companyLogo: req.body.companyLogo,
        companyName: req.body.companyName,
        applyMethod: req.body.applyMethod,
    }

    kafka.make_request('jobPost', data, function (err, result) {
        if (err) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Posting of job failed",
                "info": {
                    "error": err
                }
            }
            res.end(JSON.stringify(data))
        } else if (result && (result.message || result.errmsg)) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Posting of job failed",
                "info": {
                    "error": result.message
                }
            }
            res.end(JSON.stringify(data))
        } else {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 1,
                "msg": "Job successfully posted",
                "info": {
                    "result": result
                }
            }

            //update redis cache here
            res.end(JSON.stringify(data))
        }
    })
})


/**
 * get job details 
 */
router.get("/:jobId", async function (req, res, next) {
    console.log("Inside get joblist.")

    const data = {
        jobId: req.params.jobId
    }

    kafka.make_request('getJobDetails', data, function (err, result) {
        if (err) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Couldn't fetch job details",
                "info": {
                    "error": err
                }
            }
            res.end(JSON.stringify(data))
        } else if (result && (result.message || result.errmsg)) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Couldn't fetch job details",
                "info": {
                    "error": err
                }
            }
            res.end(JSON.stringify(data))
        } else {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 1,
                "msg": "Job details successfully fetched",
                "info": {
                    "result": result
                }
            }
            res.end(JSON.stringify(data))
        }
    })
})


/**
 * search based on jobs
 * here apply caching
 */

/*
job search with redis cache function
*/
getJobsSearch_Caching = function (Job, redis, userID, callback) {
    console.log("_________userID________", userID);

    var searched_job_title = userID.job_title
    var searched_job_location = userID.location

    //making the regex for the mongo query
    var splitted = searched_job_title.split(" ");
    var regex_str = "^(.*";
    for (let i = 0; i < splitted.length; i++) {
        regex_str = regex_str + splitted[i] + ".*";
    }
    regex_str = regex_str + ")$";

    const key = (searched_job_location + searched_job_title).toLowerCase();
    console.log("_______________key_________________", key)
    // redis.hmget('offers',userID,function (err, reply) {
    redis.get(key, function (err, reply) {

        if (err) callback(null);
        else if (reply) {
            console.log("___________________________from cache_______________________________")
            callback(JSON.parse(reply));
        } //user exists in cache

        else {
            //user doesn't exist in cache - we need to query the main database
            // const userID = req.params.userID

            kafka.make_request("jobSearch", userID, function (err, result) {
                if (err) {
                    console.log("____________err___________", err);
                    callback(err);
                } else if (result && (result.message || result.errmsg)) {

                    const data = {
                        "status": 0,
                        "msg": "Couldn't search for job details provided",
                        "info": {
                            "error": result.message
                        }
                    }

                    callback(data);
                } else {

                    if (result.length > 0) {
                        const data = {
                            "status": 1,
                            "msg": "Job Search Successfull",
                            "info": {
                                "result": result
                            }
                        }
                        const key = (searched_job_location + searched_job_title).toLowerCase();
                        redis.set(key, JSON.stringify(result), function () {

                            console.log("_____________setting in cache_________________ ")
                            callback(data);
                        });

                    } else {
                        const data = {
                            "status": 1,
                            "msg": "No result in the search",
                            "info": {
                                "result": result
                            }
                        }
                        callback(data);

                    }

                }
            })

        }
    });
};

router.post("/search", async function (req, res, next) {

    console.log("\nInside the search request for jobs");
    console.log("\nRequest obtained is : ");
    console.log(JSON.stringify(req.body));

    var searched_job_title = req.body.job_title
    var searched_job_location = req.body.location

    //making the regex for the mongo query
    var splitted = searched_job_title.split(" ");
    var regex_str = "^(.*";
    for (let i = 0; i < splitted.length; i++) {
        regex_str = regex_str + splitted[i] + ".*";
    }
    regex_str = regex_str + ")$";

    if (!req.body) {
        // res.status(400).send("Please send a proper userID");
        res.writeHead(200, {
            'Content-Type': 'application/json'
        })
        const data = {
            "status": 0,
            "msg": "No Such Data Found",
            "info": {
                "error": err
            }
        }
        res.end(JSON.stringify(data))
    }
    else {
        getJobsSearch_Caching(Job, redis, req.body, function (result) {
            if (!req.body) {
                res.status(500).send("Server error");
            }
            else {

                res.writeHead(200, {
                    'Content-Type': 'application/json'
                })
                console.log("___________result_________", result)
                res.end(JSON.stringify(result))

            }
        });
    }

});


/**
 * edit job details 
 * update redis cache here and then make the kafka call 
 */
router.put("/:jobId", async function (req, res, next) {
    console.log("\nInside the edit request for jobs");
    console.log("\nRequest obtained is : ");
    console.log(JSON.stringify(req.body));

    const data = {
        setJobId: req.params.jobId,
        job_title: req.body.jobTitle,
        job_description: req.body.description,
        job_industry: req.body.industry,
        employment_type: req.body.employmentType,
        job_location: req.body.location,
        job_function: req.body.jobFunction,
        company_logo: req.body.companyLogo
    }


    kafka.make_request('editJobDetails', data, function (err, result) {
        if (err) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Couldn't edit job details provided",
                "info": {
                    "error": err
                }
            }
            res.end(JSON.stringify(data))
        } else if (result && (result.message || result.errmsg)) {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 0,
                "msg": "Couldn't edit job details provided",
                "info": {
                    "error": result.message
                }
            }
            res.end(JSON.stringify(data))
        } else {
            res.writeHead(200, {
                'Content-Type': 'application/json'
            })
            const data = {
                "status": 1,
                "msg": "Job successfully updated",
                "info": {
                    "result": result
                }
            }
            res.end(JSON.stringify(data))
        }
    })
})




module.exports = router;
