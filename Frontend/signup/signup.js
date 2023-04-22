const Name = document.querySelector("#name");
const Email = document.querySelector("#email");
const Phone = document.querySelector("#phone");
const Password = document.querySelector("#password")

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector('form').onsubmit = (e) => {
        e.preventDefault()

        const name = Name.value;
        const email = Email.value;
        const phone = Phone.value ;
        const password = Password.value ;

        console.log(name, email, phone, password);
    }
})