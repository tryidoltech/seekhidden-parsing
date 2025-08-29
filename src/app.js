import express from 'express';

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Feed Ingestion Service Running...");
});


export default app;