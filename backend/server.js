const app = require("./index");
const reminderJob = require("./jobs/reminderJob");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Healthcare Appointment Manager API listening on port ${PORT}`);
    reminderJob.start();
});