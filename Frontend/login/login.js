const url = "http://localhost:3000"

const Email = document.querySelector("#email");
const Password =  document.querySelector("#password");

const alertu = document.querySelector('.alertu');

document.addEventListener("DOMContentLoaded", ()=>{

    document.querySelector(".login").onsubmit = async (e) => {
        e.preventDefault();
        try{
            const email = Email.value;
            const password = Password.value;
            const user = {
                email : email,
                password : password
            }

           const response = await axios.post(`${url}/user/login`,user)
           if(response.status == 200){
                const token = response.data.token;
               localStorage.setItem("token",token);
               alert("User Logged in successfully")
           }else{
                throw new Error("Login Failed")
           }
        }
        catch(err){       
            alertu.innerHTML = `<div class="alert alert-danger alert-dismissible fade in">
            <a href="#" class="close" data-dismiss="alert" aria-label="close">&times;</a>${err.response.data.message}
            </div>`
            setTimeout(() => document.querySelector('.alert').remove(),3000)
           }
    }

})