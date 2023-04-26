const Message = require('../models/message');
const User = require('../models/user')

const s3Services = require('../services/s3services');

const Sequelize = require('sequelize');
const fs = require('fs')

const { Op } = require('sequelize')
exports.postMessage = async (req, res, next) => {
   try{
    const user = req.user;
    const message  = req.body.message;
    const groupId = req.query.groupid;
    console.log(groupId);

    await user.createMessage({
        message : message,
        groupId : groupId
    })
    res.status(200).json({ success : true })
   }
   catch(err){
    console.log(err);
   }
}

exports.getMessages = async (req, res, body) => {
  try{
    const lastMessageId = req.query.lastmessageid;
    const groupId = req.query.groupid;
    const messages = await Message.findAll({
        include: [{
          model: User,
          attributes: ['name', "id"]
        }],
        attributes: ['message', "id"],
        where : {
          id : {
            [Op.gt] : lastMessageId
          },
          groupId : groupId
        }
      });
    res.status(200).json(messages)
  }
  catch(err){
    console.log(err);    
  }
}

exports.postFile = async (req, res, next) => {
  try{
    const user = req.user
    const name = req.headers['file-name'];
    const groupId = req.headers['group-id'];
    const userId = req.headers['user-id'];

    req.on('data', chunk => {
      fs.appendFileSync(name, chunk);
    })

    const fileName = `Group_${groupId}/User_${userId}/${name}`
    const fileUrl = await s3Services.uploadTos3(fileName,fileName)  
    await user.createMessage({
      message : `<a href = "${fileUrl}">${name}</a>`,
      groupId : groupId
    })
    fs.unlink(name, (err) => {
      if(err){
        console.log(err);
      }
    })
  }
  catch(err){
    console.log(err);
  }
} 

