const Message = require('../models/message');
const User = require('../models/user')

const Sequelize = require('sequelize');

const { Op } = require('sequelize')

exports.postMessage = async (req, res, next) => {
   try{
    const user = req.user;
    const message  = req.body.message;
    const groupId = req.query.groupid;

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

