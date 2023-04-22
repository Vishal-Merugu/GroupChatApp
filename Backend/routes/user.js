const express = require('express')

const router = express.Router()

const userControllers = require('../controllers/user')

router.post('/signup', userControllers.postSignUp);

router.post('/login', userControllers.postLogin);

module.exports = router