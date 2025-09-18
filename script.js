// --- DATA MÔ PHỎNG ---
// Một danh sách từ vựng nhỏ để mô phỏng
const vocabulary = [
    'là', 'một', 'học sinh', 'giáo viên', 'bác sĩ', 'kỹ sư',
    'đi', 'chơi', 'học', 'làm', 'ăn', 'ngủ', 'xem', 'phim',
    'rất', 'vui', 'buồn', 'hạnh phúc', 'lo lắng', 'mệt mỏi',
    'đến', 'trường', 'công ty', 'nhà', 'bệnh viện', 'công viên',
    'và', 'nhưng', 'tuy nhiên', 'vì vậy', 'để', 'có thể',
    'hôm nay', 'ngày mai', 'thời tiết', 'khá', 'đẹp', 'nắng'
];
// Xác suất cơ bản (log probabilities) cho mỗi từ, mô phỏng đầu ra của một mô hình
// Các từ phổ biến hơn sẽ có giá trị cao hơn
const baseLogProbs = vocabulary.map(() => -Math.random() * 5 - 1);
// Tăng xác suất cho một vài từ hợp lý sau "Hôm nay tôi"
baseLogProbs[vocabulary.indexOf('đi')] = -0.5;
baseLogProbs[vocabulary.indexOf('học')] = -0.8;
baseLogProbs[vocabulary.indexOf('làm')] = -1.0;
baseLogProbs[vocabulary.indexOf('rất')] = -1.2;
baseLogProbs[vocabulary.indexOf('là')] = -1.5;

// --- DOM ELEMENTS ---
const tempSlider = document.getElementById('temperature');
const topPSlider = document.getElementById('topP');
const tempValue = document.getElementById('temperatureValue');
const topPValue = document.getElementById('topPValue');
const generateBtn = document.getElementById('generateBtn');
const promptInput = document.getElementById('promptInput');
const generatedText = document.getElementById('generatedText');
const statusEl = document.getElementById('status');

let currentDistribution = [];
let simulationRunning = false;

// --- LOGIC TÍNH TOÁN ---

// Áp dụng Temperature vào log probabilities
function applyTemperature(logProbs, temperature) {
    if (temperature <= 0) temperature = 0.01; // Tránh chia cho 0
    return logProbs.map(lp => lp / temperature);
}

// Chuyển đổi log probabilities thành probabilities (softmax)
function softmax(logProbs) {
    const maxLogProb = Math.max(...logProbs);
    const exps = logProbs.map(lp => Math.exp(lp - maxLogProb));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
}

// Lọc theo Top-P
function applyTopP(dist, topP) {
    const sortedDist = [...dist].sort((a, b) => b.prob - a.prob);
    let cumulativeProb = 0;
    const candidates = [];
    const eliminated = [];

    for (const item of sortedDist) {
        if (cumulativeProb < topP) {
            candidates.push(item);
            cumulativeProb += item.prob;
        } else {
            eliminated.push(item);
        }
    }
    return { candidates, eliminated };
}

// Chọn một từ từ danh sách ứng viên dựa trên xác suất của chúng
function sampleFromCandidates(candidates) {
    const totalProb = candidates.reduce((sum, item) => sum + item.prob, 0);
    const normalizedCandidates = candidates.map(item => ({ ...item, prob: item.prob / totalProb }));

    let random = Math.random();
    let chosenWord = null;

    for (const candidate of normalizedCandidates) {
        if (random < candidate.prob) {
            chosenWord = candidate.word;
            break;
        }
        random -= candidate.prob;
    }
    // Fallback in case of floating point inaccuracies
    if (!chosenWord) {
        chosenWord = normalizedCandidates[0].word;
    }
    return chosenWord;
}

// --- LOGIC TRỰC QUAN HÓA (D3.js) ---

const svgContainer = d3.select("#chart");
const margin = { top: 20, right: 20, bottom: 100, left: 50 };
let width, height;
let svg, x, y;

function setupChart() {
    const containerRect = svgContainer.node().getBoundingClientRect();
    width = containerRect.width - margin.left - margin.right;
    height = containerRect.height - margin.top - margin.bottom;

    svgContainer.selectAll("*").remove(); // Xóa chart cũ

    svg = svgContainer.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleBand().range([0, width]).padding(0.2);
    y = d3.scaleLinear().range([height, 0]);

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`);
    
    svg.append("g")
        .attr("class", "y-axis");

    svg.select(".y-axis").append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 15)
        .attr("x", -height / 2)
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .attr("class", "chart-text")
        .text("Xác suất");
}

function updateChart(data, { candidates, eliminated }, selectedWord = null) {
    if (!svg) setupChart();

    // Sắp xếp dữ liệu để hiển thị đẹp hơn
    const sortedData = [...data].sort((a,b) => b.prob - a.prob);

    x.domain(sortedData.map(d => d.word));
    y.domain([0, d3.max(sortedData, d => d.prob)]);
    
    const candidateWords = new Set(candidates.map(c => c.word));
    const eliminatedWords = new Set(eliminated.map(e => e.word));

    svg.select(".x-axis")
        .transition().duration(300)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("class", "chart-text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.select(".y-axis")
        .transition().duration(300)
        .call(d3.axisLeft(y).ticks(5, "%"));

    const bars = svg.selectAll(".bar").data(sortedData, d => d.word);

    bars.exit().remove();
    
    bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.word))
        .attr("y", d => y(0))
        .attr("width", x.bandwidth())
        .attr("height", 0)
        .merge(bars)
        .transition().duration(500)
        .attr("x", d => x(d.word))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.prob))
        .attr("height", d => height - y(d.prob))
        .attr("class", d => {
            if (d.word === selectedWord) return "bar bar-selected";
            if (candidateWords.has(d.word)) return "bar bar-candidate";
            if (eliminatedWords.has(d.word)) return "bar bar-eliminated";
            return "bar bar-default";
        });
}

window.addEventListener('resize', () => {
     if (simulationRunning) {
        setupChart();
        runSimulation();
     }
});


// --- MAIN LOGIC ---

function runSimulation(selectNewWord = false, onComplete = () => {}) {
    if (!simulationRunning && selectNewWord) {
        simulationRunning = true;
    }
    if(!simulationRunning) return;
    
    statusEl.textContent = 'Đang tính toán lại phân bổ xác suất...';
    
    const temp = parseFloat(tempSlider.value);
    const topP = parseFloat(topPSlider.value);
    
    // 1. Áp dụng Temperature
    const tempLogProbs = applyTemperature(baseLogProbs, temp);

    // 2. Chuyển thành xác suất (Softmax)
    const probs = softmax(tempLogProbs);
    
    currentDistribution = vocabulary.map((word, i) => ({ word, prob: probs[i] }));
    
    // 3. Lọc theo Top-P
    const { candidates, eliminated } = applyTopP(currentDistribution, topP);
    
    let selectedWord = null;
    if (selectNewWord) {
        // 4. Chọn một từ
        selectedWord = sampleFromCandidates(candidates);
        
        const promptText = promptInput.value;
        const newText = `${promptText} ${selectedWord}`;
        generatedText.textContent = newText;
        promptInput.value = newText;
    }
    
    // 5. Cập nhật biểu đồ
    updateChart(currentDistribution, { candidates, eliminated }, selectedWord);

    if(selectNewWord) {
         statusEl.innerHTML = `Đã chọn từ <strong class="text-green-400">'${selectedWord}'</strong>. Tổng xác suất của các từ ứng viên là <strong class="text-cyan-400">${(candidates.reduce((s,c) => s+c.prob, 0) * 100).toFixed(1)}%</strong>.`;
    } else {
         statusEl.innerHTML = `Đã cập nhật biểu đồ. Tổng xác suất của các từ ứng viên là <strong class="text-cyan-400">${(candidates.reduce((s,c) => s+c.prob, 0) * 100).toFixed(1)}%</strong>.`;
    }

    onComplete();
}

// --- EVENT LISTENERS ---
tempSlider.addEventListener('input', () => {
    tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
     if (simulationRunning) runSimulation(false);
});

topPSlider.addEventListener('input', () => {
    topPValue.textContent = parseFloat(topPSlider.value).toFixed(2);
     if (simulationRunning) runSimulation(false);
});

generateBtn.addEventListener('click', () => {
    generateBtn.disabled = true;
    generateBtn.classList.add('opacity-50', 'cursor-not-allowed');
    if (!simulationRunning) {
        setupChart();
    }
    runSimulation(true, () => {
         setTimeout(() => {
            generateBtn.disabled = false;
            generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
         }, 500); // Debounce
    });
});

// Initial state
tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
topPValue.textContent = parseFloat(topPSlider.value).toFixed(2);
generatedText.textContent = promptInput.value;