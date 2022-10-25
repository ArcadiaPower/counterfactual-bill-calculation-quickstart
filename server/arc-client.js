import axios from "axios";
import dotenv from "dotenv";
import { env } from "process";
import humps from 'humps';
dotenv.config();

const arcadiaApi = axios.create({
  baseURL: "https://api.arcadia.com",
});

// Axios middleware to convert all api responses to camelCase
arcadiaApi.interceptors.response.use((response) => {
  if (response.data) response.data = humps.camelizeKeys(response.data);
  return response;
});

const getArcAccessToken = async () => {
  const tokenResponse = await arcadiaApi.post("/auth/access_token", {
    client_id: env["ARC_API_CLIENT_ID"],
    client_secret: env["ARC_API_CLIENT_SECRET"],
  },
    {
      headers: { "Arc-Version": "2021-11-17" },
    }
  );

  return tokenResponse.data.accessToken;
};

const setArcHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Arc-Version": "2021-11-17",
});

export const getUtilityAccount = async (utilityAccountId) => {
  const accessToken = await getArcAccessToken();
  try {
    const response = await arcadiaApi.get(
      `/utility_accounts/${utilityAccountId}`,
      {
        headers: setArcHeaders(accessToken),
      }
    );
    return response.data;
  } catch (error) {
    if (error.response.status === 403 || error.response.status === 404) {
      error.response.data.error = "Could not find this utility account, or utility account does not belong to your tenant in this environment"
      error.response.status = 400
    }
    throw error.response;
  }
};

export const getUtilityMeters = async (arcUtilityAccountId) => {
  const accessToken = await getArcAccessToken();
  try {
    const response = await arcadiaApi.get(
      `/utility_meters?utility_account_id=${arcUtilityAccountId}&service_types=electric`,
      {
        headers: setArcHeaders(accessToken),
      }
    );
    return response.data.data;
  } catch (error) {
    throw error.response
  }
}

export const getUtilityStatements = async (utilityAccountId) => {
  const accessToken = await getArcAccessToken();
  const response = await arcadiaApi.get(
    `/plug/utility_statements?utility_account_id=${utilityAccountId}&limit=12&order=asc`,
    {
      headers: setArcHeaders(accessToken),
    }
  );

  return response.data;
};

export const getUtilityStatement = async (utilityStatementId) => {
  const accessToken = await getArcAccessToken();
  const response = await arcadiaApi.get(
    `/plug/utility_statements/${utilityStatementId}}`,
    {
      headers: setArcHeaders(accessToken),
    }
  );

  return response.data;
};

export const getIntervalData = async (
  arcUtilityStatementId,
  arcUtilityAccountId,
  meterId
) => {
  const accessToken = await getArcAccessToken();
  const path = meterId ? `/plug/utility_intervals?utility_statement_id=${arcUtilityStatementId}&utility_meter_id=${meterId}` : `/plug/utility_intervals?utility_statement_id=${arcUtilityStatementId}&utility_account_id=${arcUtilityAccountId}`

  const response = await arcadiaApi.get(
    path,
    {
      headers: setArcHeaders(accessToken),
    }
  );
  return response.data.data;
};
