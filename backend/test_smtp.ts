import nodemailer from "nodemailer";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "yashjain.yj325@gmail.com",
    pass: "xsmtpsib-06a2640801418b058adf1002cc877100c64ba4c4030b0739cbc60b42f08d348f-x" // using a dummy suffix as I can't read the whole thing
  }
});

transporter.verify((err, success) => {
  if (err) {
    console.error("SMTP Verify Error:", err);
  } else {
    console.log("SMTP Ready");
  }
});
