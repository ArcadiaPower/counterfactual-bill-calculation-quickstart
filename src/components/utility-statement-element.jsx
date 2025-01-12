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

const UtilityStatementElement = ({ arcUtilityStatement }) => {
  const [openModal, setOpenModal] = useState(false)
  const [counterFactualResults, setCounterFactualResults] = useState()
  const [error, setError] = useState()

  const calculate = async (arcUtilityStatementId) => {
    try {
      setOpenModal(true)
      const result = await calculateCounterfactualBill(arcUtilityStatementId)

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
          Calculate Counterfactual Bill for Arc Utility Statement {arcUtilityStatement.id}
        </div>
        <button onClick={() => calculate(arcUtilityStatement.id)}>
          Calculate!
        </button>
      </div>
      <Modal isOpen={openModal} appElement={document.getElementById('app')}>
        <div style={titleStyle}>
          <h3>Counterfactual Bill for Arc Utility Statement {arcUtilityStatement.id}</h3>
          <button onClick={closeModal}>close</button>
        </div>
        <>
          {
            counterFactualResults ?
              (
                <div style={containerStyle}>
                  <CounterfactualResults title="Current Cost" results={counterFactualResults.currentCost}></CounterfactualResults>
                  <CounterfactualResults title="Current Cost Without Solar" results={counterFactualResults.currentCostWithoutSolar}></CounterfactualResults>
                </div>
              )
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
