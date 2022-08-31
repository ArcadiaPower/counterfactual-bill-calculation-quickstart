import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  getUtilityAccount,
  getUtilityStatements,
  getUtilityStatement,
} from "./arc-client.js";
import {
  createSwitchAccount,
  createTariff,
  createUsageProfileIntervalData,
  createProductionProfileSolarData,
  calculateCurrentBillCost,
  calculateCurrentBillCostWithoutSolar
} from "./genability-client.js";
dotenv.config();

const { PORT } = process.env;
const port = 3010;
const app = express();
app.use(express.json());

// Allow the browser to send/receive cookies from the Connect Component in development mode
const corsOptions = {
  credentials: true,
  origin: ["http://localhost:8090"],
};
app.use(cors(corsOptions));

// In this contrived example, use this global var to keep track of the genabilityAccountId
let genabilityAccountId = null;

app.post("/create_genability_account", async (req, res) => {
  const { utilityAccountId } = req.body;
  try {
    const arcUtilityAccount = await getUtilityAccount(utilityAccountId);
    const genabilityAccount = await createSwitchAccount(arcUtilityAccount);
    genabilityAccountId = genabilityAccount.accountId;

    res.json({ genabilityAccount });
    res.status(200);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res.sendStatus(500);
    }
  }
});

app.get("/fetch_utility_statements", async (req, res) => {
  const { utilityAccountId } = req.query;

  try {
    const arcUtilityStatements = await getUtilityStatements(utilityAccountId);

    res.json({ utilityStatements: arcUtilityStatements });
    res.status(200);
  } catch (error) {
    if (error.response) {
      console.log(error)
      res.status(error.response.status).send(error.response.data);
    } else {
      res.sendStatus(500);
    }
  }
});

app.post("/calculate_counterfactual_bill", async (req, res) => {
  const { utilityStatementId } = req.body;

  try {
    const arcUtilityStatement = await getUtilityStatement(utilityStatementId);

    // Step 1: Post Tariff from current UtilityStatement. The genabilityAccountId is set as a Global variable.
    const tariff = await createTariff(genabilityAccountId, arcUtilityStatement);

    // Step 2: Update Interval Data Usage Profile
    await createUsageProfileIntervalData(
      genabilityAccountId,
      arcUtilityStatement
    );
    // Step 4: Create/Update Solar Usage Profile
    const solarProductionProfile = await createProductionProfileSolarData(genabilityAccountId);

    // Step 5: Calculate Costs
    const currentCost = await calculateCurrentBillCost(arcUtilityStatement, genabilityAccountId);

    // Step 6: calculate cost without solar
    const currentCostWithoutSolar = await calculateCurrentBillCostWithoutSolar(arcUtilityStatement, solarProductionProfile)

    res.json({
      currentCost: currentCost.results[0],
      currentCostWithoutSolar: currentCostWithoutSolar.results[0],
    });
    res.status(200);
  } catch (error) {
    console.log("oh no we encountered an error!", error); // TODO: parse HTTP errors if they exists error.response.data.error
    console.log('error parsed', error.response.data)
  }
});

// Starts the server
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
