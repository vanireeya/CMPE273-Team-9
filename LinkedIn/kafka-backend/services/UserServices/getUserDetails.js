var UserInfo = require('../../../backend/models/userInfo')//.users
var Application = require('../../../backend/models/application')
var Job = require('../../../backend/models/job')
var Message = require('../../../backend/models/message')

function handle_request(msg, callback) {

    console.log("\n\nInside kafka backend for fetching user details")
    console.log("\n\n User data is: ", msg)

    UserInfo.findByIdAndUpdate(msg.userId)
    .populate('jobs_applied')
    .populate('jobs_posted')
    .populate('jobs_saved')
    .populate('applications')
    .exec()
        .then(result => {
            callback(null,result)
        })
        .catch(err => {
            callback(err,err)
        })
}


exports.handle_request = handle_request;