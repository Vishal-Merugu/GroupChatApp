const Message = require('../models/message');

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