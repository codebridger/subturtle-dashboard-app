const urlParams = new URLSearchParams(window.location.search);
const wordsData = urlParams.get('words');
const backgroundColor = decodeURIComponent(urlParams.get('backgroundColor'));

const pallet = {
    '#FFFAE6': ['#FF9F66', '#FF5F00', '#002379'],
    '#ACE1AF': ['#B0EBB4', '#BFF6C3', '#E0FBE2'],
    '#6DC5D1': ['#FDE49E', '#FEB941', '#DD761C'],
    '#F8D082': ['#B51B75', '#E65C19', '#640D6B'],
    '#C3FF93': ['#FFDB5C', '#FFAF61', '#FF70AB'],
    '#FF76CE': ['#FDFFC2', '#94FFD8', '#A3D8FF'],
    '#5BBCFF': ['#FFFAB7', '#FFD1E3', '#7EA1FF'],
};

let wordsList = JSON.parse(decodeURIComponent(wordsData));
wordsList = wordsList.map((word) => {
    const { innerHeight, innerWidth } = window;
    // generate random weight for each word based on the screen width
    const weight = Math.floor((Math.random() * innerWidth) / 10);

    return [word, weight];
});

function getBackgroundColor() {
    const lightColors = Object.keys(pallet);
    return lightColors[Math.floor(Math.random() * lightColors.length)];
}

function getWordColor(bg) {
    const colors = pallet[bg] || ['black', 'blue'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function generateCover() {
    const canvas = document.getElementById('wordcloud');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const backgroundColor = getBackgroundColor();

    WordCloud(document.getElementById('wordcloud'), {
        list: wordsList,
        color: () => getWordColor(backgroundColor),
        backgroundColor,
    });
}

generateCover();
