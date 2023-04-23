const Message = require('../models/message');
const User = require('../models/user')

const Sequelize = require('sequelize')

exports.postMessage = async (req, res, next) => {
   try{
    const user = req.user;
    const message  = req.body.message;

    await user.createMessage({
        message : message
    })
    res.status(200).json({ success : true })
   }
   catch(err){
    console.log(err);
   }
}

exports.getMessages = async (req, res, body) => {
    const messages = await Message.findAll({
        include: [{
          model: User,
          attributes: ['name']
        }],
        attributes: ['message']
      });
    res.status(200).json(messages)
}