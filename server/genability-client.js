import axios from "axios";
import dotenv from "dotenv";
import dayjs from "dayjs";
import { env } from "process";
import { getIntervalData, getUtilityMeters } from "./arc-client.js";
import { readFile } from 'fs/promises';
dotenv.config();

// This is mock solar production data and should be substituted
// for real solar production data in a a production implmentation.
const mock8760Data = JSON.parse(
  await readFile(
    new URL('./assets/mock-8760-solar-profile.json', import.meta.url)
  )
);

const genabilityApi = axios.create({
  baseURL: "https://api.genability.com",
});

// https://developer.genability.com/api-reference/basics/security/
const genabilityToken = Buffer.from(
  `${env["GENABILITY_APPLICATION_ID"]}:${env["GENABILITY_APPLICATION_KEY"]}`
).toString("base64");
const genabilityHeaders = { Authorization: `Basic ${genabilityToken}` };

export const createSwitchAccount = async (arcUtilityAccount) => {
  const body = {
    providerAccountId: arcUtilityAccount.id,
    accountName: `Bill Calculation Quickstart for Arc Utility Account ${arcUtilityAccount.id}`,
    address: {
      address1: arcUtilityAccount.serviceAddressStreetOne,
      address2: arcUtilityAccount.serviceAddressStreetTwo,
      city: arcUtilityAccount.serviceAddressCity,
      state: arcUtilityAccount.serviceAddressState,
      zip: arcUtilityAccount.serviceAddressZip,
    },
    properties: {
      customerClass: {
        keyName: "customerClass",
        dataValue: 1,
      },
    },
  };

  // You can send either a POST or a PUT request to create an account.
  // Using a PUT request allows an “upsert”, where the account will be added if it doesn’t exist yet, or updated if it does.
  // You use the providerAccountId property as your own unique identifier.
  const response = await genabilityApi.put("rest/v1/accounts", body, {
    headers: genabilityHeaders,
  });

  return response.data.results[0];
};

const calculateServiceEndDate = (serviceEndDate, serviceWindowInclusiveOfEndDate) => {
  // Different utilities treat the service_end_date as either (1) exclusive or (2) inclusive of the services on the bill.
  // While Arc currently handles these edge cases, we need to be aware of the differences when pairing calculations with Genability features.
  if (serviceWindowInclusiveOfEndDate) {
    return dayjs(serviceEndDate).add(1, "day").format("YYYY-MM-DD")
  }
  return serviceEndDate;
}

// We are updating the tariff collection everytime we try to calculate a counterfactual bill.
// https://www.switchsolar.io/api-reference/account-api/account-tariff/
export const createTariff = async (
  genabilityAccountId,
  arcUtilityStatement
) => {
  if (!arcUtilityStatement.tariff) {
    throw new Error("This Utility Statement does not have a known tariff!")
  }

  // The following will transform the tariff into the correct form for Genability e.g. gen_mtid_522 => 522
  const parsedTariffId = arcUtilityStatement.tariff.mainTariffId.replace(
    "gen_mtid_",
    ""
  );

  const body = {
    masterTariffId: parsedTariffId,
    serviceType: "ELECTRICITY",
    effectiveDate: arcUtilityStatement.serviceStartDate,
    endDate: arcUtilityStatement.serviceEndDate,
  };

  const result = await genabilityApi.put(`rest/v1/accounts/${genabilityAccountId}/tariffs`, body, {
    headers: genabilityHeaders,
  });

  return result
};

export const deleteExistingGenabilityProfiles = async (genabilityAccountId) => {
  const existingUsageProfiles = await getExistingGenabilityProfiles(genabilityAccountId);
  if (existingUsageProfiles.data.count > 0) {
    for (const usageProfile of existingUsageProfiles.data.results) {
      await genabilityApi.delete(`rest/v1/profiles/${usageProfile.profileId}`, { headers: genabilityHeaders })
    }
  }
}

export const getExistingGenabilityProfiles = async (genabilityAccountId) => {
  const existingUsageProfiles = await genabilityApi.get(`rest/v1/profiles?accountId=${genabilityAccountId}`, { headers: genabilityHeaders });
  return existingUsageProfiles;
}

export const createUsageProfiles = async (arcUtilityStatement, genabilityAccountId) => {
  const meters = await getUtilityMeters(arcUtilityStatement.utilityAccountId)
  if (meters.length) {
    // If there are multiple meters associated with the statement period,
    // we create a usage profile for each meter. All usage profiles will
    // be used when we run calculations.
    for (let meter of meters) {
      await createUsageProfileIntervalData(
        genabilityAccountId,
        arcUtilityStatement,
        meter.id
      );
    }
  } else {
    // If an account does not have meter-level data,
    // we attempt to get interval data at the statement level.
    await createUsageProfileIntervalData(
      genabilityAccountId,
      arcUtilityStatement,
      null
    );
  }
  return meters;
}

export const createUsageProfileIntervalData = async (
  genabilityAccountId,
  arcUtilityStatement,
  meterId
) => {

  const intervalData = await getIntervalData(
    arcUtilityStatement.id,
    arcUtilityStatement.utilityAccountId,
    meterId
  );

  const transformedIntervalData = intervalData.map((interval) => {
    return {
      fromDateTime: interval.startTime,
      toDateTime: interval.endTime,
      quantityUnit: "kwh",
      quantityValue: interval.netKwh,
    };
  });

  const body = {
    accountId: genabilityAccountId,
    providerProfileId: `ELECTRICITY_USAGE_UA_${arcUtilityStatement.utilityAccountId}${meterId ? "_METER_" + meterId : '_WITHOUT_METER'}`,
    profileName: `Interval Data for ${meterId ? 'meter ' + meterId : 'utility_account ' + arcUtilityStatement.utilityAccountId}`,
    description: `Usage Profile using Interval Data for Utility Account ${arcUtilityStatement.utilityAccountId}${meterId ? " - meter: " + meterId : ""}`,
    isDefault: false,
    serviceTypes: "ELECTRICITY",
    sourceId: "ReadingEntry",
    readingData: transformedIntervalData,
  };

  return await genabilityApi.put(`rest/v1/profiles`, body, {
    headers: genabilityHeaders,
  });
};

export const getAndTransform8760Data = (startDateTime) => {
  // In this example, we're initializing/updating the solar data production profile
  // with an entire year's worth of mock production data. With real data, a developer
  // may only be updating the solar data production profile with the current statement
  // period's solar production data.

  let currentDateTime = dayjs(startDateTime);
  const baselineMeasures = mock8760Data.results[0].baselineMeasures;
  return baselineMeasures.map(row => {
    const startTime = currentDateTime;
    const endTime = currentDateTime.add(1, 'hour')
    const transformedRow = {
      fromDateTime: startTime.toISOString(),
      toDateTime: endTime.toISOString(),
      quantityUnit: "kWh",
      quantityValue: row.v.toString()
    }
    currentDateTime = endTime
    return transformedRow;
  })
}

export const createProductionProfileSolarData = async (genabilityAccountId) => {
  // This will add a new profile (if one with this providerProfileId doesn’t exist)
  // and at the same time also add the readings included in the request.
  // See https://www.switchsolar.io/api-reference/account-api/usage-profile/#example-5---upload-a-solar-profile-with-baselinemeasure-data for more detail.

  const body = {
    accountId: genabilityAccountId,
    providerProfileId: 'PVWATTS_5kW',
    profileName: "Solar System Actual Production",
    serviceTypes: "SOLAR_PV",
    sourceId: "ReadingEntry",
    properties: {
      systemSize: {
        keyName: "systemSize",
        dataValue: "5"
      }
    },

    // Can arbitrarily set the start date for mock solar production data.
    // If you're not seeing a difference between the bill with solar production data
    // and the bill witout solar production data, it may be because this date below is AFTER the statement's end date.
    readingData: getAndTransform8760Data("2022-01-01T00:00-0700")
  }

  const response = await genabilityApi.put(`/rest/v1/profiles`, body, {
    headers: genabilityHeaders
  })

  return response.data
};

const transformPropertyInputs = (propertyInputs) => {
  return propertyInputs.map(propertyInput => {
    return {
      keyName: propertyInput.id,
      dataValue: propertyInput.value
    }
  })
}

export const calculateCurrentBillCost = async (arcUtilityStatement, genabilityAccountId) => {
  let electricNonDefaultProfiles = await getExistingNonDefaultProfiles(genabilityAccountId, 'ELECTRICITY')
  electricNonDefaultProfiles = electricNonDefaultProfiles.map(usageProfile => {
    return {
      keyName: 'profileId',
      dataValue: usageProfile.profileId,
      operator: '+'
    }
  })

  const propertyInputs = transformPropertyInputs(arcUtilityStatement.tariff.propertyInputs)

  const body = {
    fromDateTime: arcUtilityStatement.serviceStartDate,
    toDateTime: calculateServiceEndDate(arcUtilityStatement.serviceEndDate, arcUtilityStatement.serviceWindowInclusiveOfEndDate),
    billingPeriod: true,
    minimums: false,
    groupBy: "MONTH",
    detailLevel: "CHARGE_TYPE_AND_TOU",
    propertyInputs: [...electricNonDefaultProfiles, ...propertyInputs]
  };
  const response = await genabilityApi.post(
    `rest/v1/accounts/pid/${arcUtilityStatement.utilityAccountId}/calculate/`,
    body,
    {
      headers: genabilityHeaders,
    }
  );
  return response.data
};

export const getExistingNonDefaultProfiles = async (genabilityAccountId, serviceType) => {
  // https://www.switchsolar.io/api-reference/account-api/usage-profile/#examples
  // The first usage profile with a serviceType of 'ELECTRICITY' will automatically be set
  // to isDefault: true, which means it will be used in calculations without the need to specify
  // its profileId. Here, we want to get all the nonDefault usage profiles in the case of a multi-meter
  // account so those usage profiles can be included in the calculation by profileId.
  const existingUsageProfiles = await getExistingGenabilityProfiles(genabilityAccountId);
  return existingUsageProfiles.data.results.filter(usageProfile => (usageProfile.serviceTypes === serviceType) && (usageProfile.isDefault === false))
}

export const calculateCurrentBillCostWithoutSolar = async (arcUtilityStatement, solarProductionProfile, genabilityAccountId) => {
  // https://www.switchsolar.io/tutorials/actuals/electricity-savings/

  let electricNonDefaultProfiles = await getExistingNonDefaultProfiles(genabilityAccountId, 'ELECTRICITY')
  electricNonDefaultProfiles = electricNonDefaultProfiles.map(usageProfile => {
    return {
      keyName: 'profileId',
      dataValue: usageProfile.profileId,
      operator: '+'
    }
  })

  const propertyInputs = transformPropertyInputs(arcUtilityStatement.tariff.propertyInputs)

  const body = {
    fromDateTime: arcUtilityStatement.serviceStartDate,
    toDateTime: calculateServiceEndDate(arcUtilityStatement.serviceEndDate, arcUtilityStatement.serviceWindowInclusiveOfEndDate),
    billingPeriod: true,
    minimums: false,
    groupBy: "MONTH",
    detailLevel: "CHARGE_TYPE",
    propertyInputs: [
      {
        keyName: "profileId",
        dataValue: solarProductionProfile.results[0].profileId,
        operator: "+"
      },
      ...electricNonDefaultProfiles,
      ...propertyInputs
    ]
  }

  const response = await genabilityApi.post(
    `rest/v1/accounts/pid/${arcUtilityStatement.utilityAccountId}/calculate/`,
    body,
    {
      headers: genabilityHeaders,
    }
  );

  return response.data
}
