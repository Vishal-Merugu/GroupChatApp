const express = require("express");

const router = express.Router()

const groupControllers = require("../controllers/group");

const authenticate = require('../middlewares/auth')

//to create or post new group
router.post('/group',authenticate.authenticate, groupControllers.postGroup);

//to get a;; groups related to a user
router.get('/', authenticate.authenticate, groupControllers.getGroups);

//to get info about a single group
router.get('/:groupId', authenticate.authenticate, groupControllers.getGroup);

//to delete a group
router.delete('/:groupId', authenticate.authenticate, groupControllers.deleteGroup);

//to edit a group
router.put('/:groupId', authenticate.authenticate, groupControllers.editGroup);

module.exports = router;


