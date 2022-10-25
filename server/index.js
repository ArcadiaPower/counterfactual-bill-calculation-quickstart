import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  getUtilityAccount,
  getUtilityStatements,
  getUtilityStatement
} from "./arc-client.js";
import {
  createSwitchAccount,
  createTariff,
  createUsageProfiles,
  createProductionProfileSolarData,
  calculateCurrentBillCost,
  calculateCurrentBillCostWithoutSolar,
  deleteExistingGenabilityProfiles
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

const errorHandler = (error, request, response, next) => {
  if (error.response || error.message) {
    response.status(error.response?.status || 500).send(error.response?.data.error || error.message)
  } else {
    response.sendStatus(500);
  }
}

// In this contrived example, use this global var to keep track of the genabilityAccountId
let genabilityAccountId = null;

app.post("/create_genability_account", async (req, res, next) => {
  const { utilityAccountId } = req.body;
  try {
    const arcUtilityAccount = await getUtilityAccount(utilityAccountId);
    const genabilityAccount = await createSwitchAccount(arcUtilityAccount);
    genabilityAccountId = genabilityAccount.accountId;

    res.json({ genabilityAccount });
    res.status(200);
  } catch (error) {
    next(error)
  }
});

app.get("/fetch_utility_statements", async (req, res, next) => {
  const { utilityAccountId } = req.query;

  try {
    const arcUtilityStatements = await getUtilityStatements(utilityAccountId);

    res.json({ utilityStatements: arcUtilityStatements });
    res.status(200);
  } catch (error) {
    next(error)
  }
});

app.post("/calculate_counterfactual_bill", async (req, res, next) => {
  const { utilityStatementId } = req.body;

  try {
    const arcUtilityStatement = await getUtilityStatement(utilityStatementId);

    // Step 1: Post Tariff from current UtilityStatement. The genabilityAccountId is set as a Global variable.
    await createTariff(genabilityAccountId, arcUtilityStatement);

    // Step 1a: For the purposes of this reference implementation, we delete existing genability
    // profiles to produce a fresh calculation each time
    await deleteExistingGenabilityProfiles(genabilityAccountId)

    // Step 2: Create Interval Data Usage Profiles
    const metersUsedInCalculation = await createUsageProfiles(arcUtilityStatement, genabilityAccountId)

    // Step 3: Create/Update Solar Usage Profile
    const solarProductionProfile = await createProductionProfileSolarData(genabilityAccountId);

    // Step 4: Calculate Costs
    const currentCost = await calculateCurrentBillCost(arcUtilityStatement, genabilityAccountId);

    // Step 5: Calculate cost without solar
    const currentCostWithoutSolar = await calculateCurrentBillCostWithoutSolar(arcUtilityStatement, solarProductionProfile, genabilityAccountId)

    res.json({
      currentCost: currentCost.results[0],
      currentCostWithoutSolar: currentCostWithoutSolar.results[0],
      metersUsedInCalculation: metersUsedInCalculation
    });
    res.status(200);
  } catch (error) {
    next(error)
  }
});

// Starts the server
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});

app.use(errorHandler)
