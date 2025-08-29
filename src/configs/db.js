import mongoose from 'mongoose';

const connectDB = async (MONGO_URI) => {
  try {
    const conn = await mongoose.connect(MONGO_URI);

    console.log(`DB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`DB connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
