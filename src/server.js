import app from './app.js';
import dotenv from 'dotenv';
import connectDB from './configs/db.js';
dotenv.config();
import cron from 'node-cron'; // You had this already, which is great!
import { runCronCycle } from './services/feedCron.js';

connectDB(process.env.MONGO_URI);

const PORT = process.env.PORT || 6000;

// Schedule feed processing every 5 minutes using node-cron
// Note: runCronCycle logs its own start/completion
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  cron.schedule(
    '0 * * * *',
    async () => {
      console.log('[Cron] Running feed ingestion cycle...');
      await runCronCycle();
    },
    { timezone: 'UTC' }
  );
  console.log('[Cron] Scheduled feed ingestion every 5 minutes (UTC).');
});