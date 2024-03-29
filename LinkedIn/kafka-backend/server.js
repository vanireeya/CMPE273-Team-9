var connection = new require('./kafka/Connection');
var mongoose = require('mongoose')

var mongoConnection = require('../backend/connections/mongo')

var UserJobApply = require('./services/UserServices/userJobApply')
var UserJobSave = require('./services/UserServices/userJobSave')
var UserJobList = require('./services/UserServices/userJobList')
var GetUserDetails = require('./services/UserServices/getUserDetails')
var EditUserDetails = require('./services/UserServices/editUserDetails')
var UserSavedJobs = require('./services/UserServices/userSavedJobs')
var UserAppliedJobs = require('./services/UserServices/userAppliedJobs')

var JobPost = require('./services/JobServices/jobPost')
var GetJobDetails = require('./services/JobServices/getJobDetails')
var JobSearch = require('./services/JobServices/jobSearch')
var EditJobDetails = require('./services/JobServices/editJobDetails')

var UsernameSearch = require('./services/UserServices/usernameSearch')








// var login = require('./services/login.js');
// var GetJobList = require('./services/getJobList');

mongoose.connect(mongoConnection.url, {
    poolSize: mongoConnection.pool
})
    .then(() => console.log("Connected"))
    .catch((err) => console.log(err))


    function handleTopicRequest(topic_name, fname) {
    var consumer = connection.getConsumer(topic_name);
    var producer = connection.getProducer();
    console.log('server is running ');
    consumer.on('message', function (message) {
        console.log('message received for ' + topic_name + " ", fname);
        console.log(JSON.stringify(message.value));
        var data = JSON.parse(message.value);

        fname.handle_request(data.data, function (err, res) {
            console.log('after handle' + res);
            var payloads = [
                {
                    topic: data.replyTo,
                    messages: JSON.stringify({
                        correlationId: data.correlationId,
                        data: res
                    }),
                    partition: 0
                }
            ];
            producer.send(payloads, function (err, data) {
                console.log(data);
            });
            return;
        });

    });
}


handleTopicRequest('userJobApply', UserJobApply)
handleTopicRequest('userJobSave', UserJobSave)
handleTopicRequest('userJobList', UserJobList)
handleTopicRequest('getUserDetails',GetUserDetails)
handleTopicRequest('editUserDetails',EditUserDetails)
handleTopicRequest('jobPost',JobPost)
handleTopicRequest('getJobDetails',GetJobDetails)
handleTopicRequest('jobSearch',JobSearch)
handleTopicRequest('editJobDetails',EditJobDetails)
handleTopicRequest('userSavedJobs',UserSavedJobs)
handleTopicRequest('userAppliedJobs',UserAppliedJobs)
handleTopicRequest('usernameSearch',UsernameSearch)
