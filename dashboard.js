document.addEventListener('DOMContentLoaded', () => {

    // --- STATISTICS --- //

    const totalListened = listeningData.length;
    document.getElementById('total-listened').textContent = totalListened;

    const distinctListened = new Set(listeningData.map(e => e.sentenceId)).size;
    document.getElementById('distinct-listened').textContent = distinctListened;

    const weeklyAvg = (totalListened / 52).toFixed(1);
    document.getElementById('avg-week').textContent = weeklyAvg;

    const monthlyAvg = (totalListened / 12).toFixed(1);
    document.getElementById('avg-month').textContent = monthlyAvg;

    const yearlyAvg = totalListened;
    document.getElementById('avg-year').textContent = yearlyAvg;

    // --- CALENDAR HEATMAP --- //

    const heatmapContainer = document.querySelector('.heatmap-container');
    const listeningByDay = {};
    for (const event of listeningData) {
        const date = event.timestamp.toISOString().split('T')[0];
        listeningByDay[date] = (listeningByDay[date] || 0) + 1;
    }

    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
        const dateString = d.toISOString().split('T')[0];
        const count = listeningByDay[dateString] || 0;
        const cell = document.createElement('div');
        cell.classList.add('heatmap-cell');
        const intensity = Math.min(count / 10, 1);
        cell.style.backgroundColor = `rgba(0, 122, 255, ${intensity})`;
        heatmapContainer.appendChild(cell);
    }

    // --- UNCOVERING RATE HISTOGRAM --- //

    const uncoveringRateBySentence = {};
    const listenedCount = {};

    for (const event of listeningData) {
        listenedCount[event.sentenceId] = (listenedCount[event.sentenceId] || 0) + 1;
    }

    for (const event of uncoveringData) {
        uncoveringRateBySentence[event.sentenceId] = (uncoveringRateBySentence[event.sentenceId] || 0) + 1;
    }

    const uncoveringRates = [];
    for (const sentenceId in listenedCount) {
        const uncovered = uncoveringRateBySentence[sentenceId] || 0;
        const listened = listenedCount[sentenceId];
        uncoveringRates.push(uncovered / listened);
    }

    const histogramContainer = document.querySelector('.histogram-container');
    const bins = new Array(10).fill(0);

    for (const rate of uncoveringRates) {
        const binIndex = Math.min(Math.floor(rate * 10), 9);
        bins[binIndex]++;
    }

    const maxBinCount = Math.max(...bins);

    for (let i = 0; i < bins.length; i++) {
        const bar = document.createElement('div');
        bar.classList.add('histogram-bar');
        const height = (bins[i] / maxBinCount) * 100;
        bar.style.height = `${height}%`;

        const barLabel = document.createElement('div');
        barLabel.classList.add('bar-label');
        barLabel.textContent = `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`;
        bar.appendChild(barLabel);

        histogramContainer.appendChild(bar);
    }
});
