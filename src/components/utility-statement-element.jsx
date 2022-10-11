import { useState } from 'react';
import JSONPretty from 'react-json-pretty';
import { calculateCounterfactualBill } from "../session.js";
import CounterfactualResults from './counterfactual-results.jsx';
import ErrorMessage from './error-message.jsx';
import { object } from 'prop-types';
import Modal from 'react-modal';

const containerStyle = {
  display: "flex",
  gap: "20px",
}

const titleStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
}

const counterFactualHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "5px"
}

Modal.setAppElement(document.getElementById('root'));

const UtilityStatementElement = ({ arcUtilityStatement, meters }) => {
  const [openModal, setOpenModal] = useState(false)
  const [counterFactualResults, setCounterFactualResults] = useState()
  const [error, setError] = useState()
  const [selectedMeterId, setSelectedMeterId] = useState(meters[0].id)

  const handleMeterSelection = (e) => {
    setSelectedMeterId(e.target.value)
  }

  const calculate = async (arcUtilityStatementId) => {
    try {
      setOpenModal(true)
      const result = await calculateCounterfactualBill(arcUtilityStatementId, selectedMeterId)
      setCounterFactualResults(result)
    } catch (error) {
      setError(error.response)
    }
  }

  const closeModal = () => {
    setOpenModal(false)
    setError(null)
    setCounterFactualResults(null)
  }

  return (
    <div>
      <JSONPretty id="json-pretty" data={arcUtilityStatement}></JSONPretty>
      <div style={counterFactualHeaderStyle}>
        <div>
          Calculate Counterfactual Bill for Arc Utility Statement {arcUtilityStatement.id} using meter ID:
        </div>
        <select value={selectedMeterId} onChange={handleMeterSelection}>
          {meters.map((meter) => (
            <option key={meter.id} value={meter.id}>{meter.id}</option>
          ))}
        </select>
        <button onClick={() => calculate(arcUtilityStatement.id)}>
          Calculate!
        </button>
      </div>
      <Modal isOpen={openModal} appElement={document.getElementById('app')}>
        <div style={titleStyle}>
          <h3>Counterfactual Bill for Arc Utility Statement {arcUtilityStatement.id}, Meter Id: ${selectedMeterId}</h3>
          <button onClick={closeModal}>close</button>
        </div>
        <>
          {
            counterFactualResults ? <div style={containerStyle}>
              <CounterfactualResults title="Current Cost" results={counterFactualResults.currentCost}></CounterfactualResults>
              <CounterfactualResults title="Current Cost Without Solar" results={counterFactualResults.currentCostWithoutSolar}></CounterfactualResults>
            </div>
              : error ? <ErrorMessage error={error} />
                : <p>Loading...</p>
          }
        </>
      </Modal>
    </div>
  )
};

UtilityStatementElement.propTypes = {
  arcUtilityStatement: object.isRequired
};


export default UtilityStatementElement;
