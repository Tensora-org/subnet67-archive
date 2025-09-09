// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("TenexiumModule", (m) => {
  const initializeArgs = m.getParameter("initializeArgs", []);
  const protocol = m.contract(
    "TenexiumProtocol",
    initializeArgs,
    { proxy: { kind: "uups", initializer: "initialize" } }
  );
  return { protocol };
});
