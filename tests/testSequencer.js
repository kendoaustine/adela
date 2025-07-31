const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define the order of test execution
    const testOrder = [
      'infrastructure.test.js',
      'household-user-journey.test.js',
      'supplier-user-journey.test.js',
      'admin-user-journey.test.js',
      'monitoring-integration.test.js'
    ];

    return tests.sort((testA, testB) => {
      const aName = testA.path.split('/').pop();
      const bName = testB.path.split('/').pop();
      
      const aIndex = testOrder.indexOf(aName);
      const bIndex = testOrder.indexOf(bName);
      
      // If both tests are in the order array, sort by their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      // If only one test is in the order array, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // If neither test is in the order array, sort alphabetically
      return aName.localeCompare(bName);
    });
  }
}

module.exports = CustomSequencer;
