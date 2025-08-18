const listeningData = [];
const uncoveringData = [];

const today = new Date();
const oneYearAgo = new Date();
oneYearAgo.setFullYear(today.getFullYear() - 1);

// Generate listening data for the past year
for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
    // More activity on weekdays
    const activityFactor = (d.getDay() > 0 && d.getDay() < 6) ? 0.7 : 0.3;
    if (Math.random() < activityFactor) {
        const numSentences = Math.floor(Math.random() * 20) + 1;
        for (let i = 0; i < numSentences; i++) {
            listeningData.push({
                timestamp: new Date(d),
                sentenceId: `s_${Math.floor(Math.random() * 100)}`
            });
        }
    }
}

// Generate uncovering data based on listening data
for (const listeningEvent of listeningData) {
    if (Math.random() < 0.3) { // 30% chance of uncovering
        uncoveringData.push({
            timestamp: new Date(listeningEvent.timestamp),
            sentenceId: listeningEvent.sentenceId
        });
    }
}
