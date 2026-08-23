const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@clinic.example.com" },
    update: {},
    create: {
      name: "Clinic Admin",
      email: "admin@clinic.example.com",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const doctorPassword = await bcrypt.hash("Doctor@123", 10);
  const doctorUser = await prisma.user.upsert({
    where: { email: "dr.jane@clinic.example.com" },
    update: {},
    create: {
      name: "Dr. Jane Smith",
      email: "dr.jane@clinic.example.com",
      passwordHash: doctorPassword,
      role: "DOCTOR",
      doctorProfile: {
        create: {
          specialisation: "General Medicine",
          slotDurationMin: 30,
          bio: "10+ years of experience in general medicine.",
          workingHours: {
            create: [
              { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
              { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
              { dayOfWeek: 3, startTime: "09:00", endTime: "13:00" },
              { dayOfWeek: 4, startTime: "09:00", endTime: "13:00" },
              { dayOfWeek: 5, startTime: "09:00", endTime: "13:00" },
            ],
          },
        },
      },
    },
  });

  console.log("Seeded:", { admin: admin.email, doctor: doctorUser.email });
  console.log("Admin login: admin@clinic.example.com / Admin@123");
  console.log("Doctor login: dr.jane@clinic.example.com / Doctor@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
