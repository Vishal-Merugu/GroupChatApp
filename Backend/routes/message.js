const express = require('express')

const router = express.Router()

const messageControllers = require('../controllers/message');
const authenticate = require("../middlewares/auth")

router.post('/message',authenticate.authenticate, messageControllers.postMessage)

module.exports = router