const url  = ' https://group-chat-md3u.onrender.com'

const Email = document.querySelector('#email')

document.addEventListener("DOMContentLoaded",()=> {
    document.querySelector('form').onsubmit = async (e) => {
        try{
            e.preventDefault()
            const email = Email.value;
            const response = await axios.post(`${url}/password/forgotpassword`, {
                email : email
            })
            if(response.data.success){
                document.querySelector('.alertu').innerHTML = `
                <div class="alert alert-warning">
                Check Your Email
            </div>
                `
            }
        }
        catch(err){
            document.querySelector('.alertu').innerHTML = `
            <div class="alert alert-danger">
            ${err.response.data.message}
        </div>
            `
            console.log(err);
        }

    }
})

