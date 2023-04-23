const express = require("express");

const router = express.Router()

const passwordControllers = require("../controllers/password");

router.post("/forgotpassword", passwordControllers.postForgotPassword);

router.get("/resetpassword/:uuid", passwordControllers.getResetPassword);

router.post('/resetpassword/:uuid', passwordControllers.postUpdatePassword);


module.exports = router