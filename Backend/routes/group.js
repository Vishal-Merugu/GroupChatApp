const express = require("express");

const router = express.Router()

const groupControllers = require("../controllers/group");

const authenticate = require('../middlewares/auth')

router.post('/group',authenticate.authenticate, groupControllers.postGroup);

router.get('/', authenticate.authenticate, groupControllers.getGroups)






module.exports = router;


