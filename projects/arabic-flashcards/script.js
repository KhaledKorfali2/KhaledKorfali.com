// Dictionary containing Arabic letters and their forms
const letters = {
    "Alif": { "isolated": "ا", "start": "ا", "middle": "ـا", "end": "ـا"},

    "Ba": { "isolated": "ب", "start": "بـ", "middle": "ـبـ", "end": "ـب"}, 
    "Ta": { "isolated": "ت", "start": "تـ", "middle": "ـتـ", "end": "ـت"}, 
    "Tha": { "isolated": "ث", "start": "ثـ", "middle": "ـثـ", "end": "ـث"},

    "Jeem": { "isolated": "ج", "start": "جـ", "middle": "ـجـ", "end": "ـج"}, 
    "Haa": { "isolated": "ح", "start": "حـ", "middle": "ـحـ", "end": "ـح"}, 
    "Khaa": { "isolated": "خ", "start": "خـ", "middle": "ـخـ", "end": "ـخ"}, 

    "Dal": { "isolated": "د", "start": "د", "middle": "ـد", "end": "ـد"}, 
    "Dhal": { "isolated": "ذ", "start": "ذ", "middle": "ـذ", "end": "ـذ"}, 

    "Raa": { "isolated": "ر", "start": "ر", "middle": "ـر", "end": "ـر"}, 
    "Zay": { "isolated": "ز", "start": "ز", "middle": "ـز", "end": "ـز"}, 

    "Seen": { "isolated": "س", "start": "سـ", "middle": "ـسـ", "end": "ـس"}, 
    "Sheen": { "isolated": "ش", "start": "شـ", "middle": "ـشـ", "end": "ـش"}, 

    "Saad": { "isolated": "ص", "start": "صـ", "middle": "ـصـ", "end": "ـص"}, 
    "Daad": { "isolated": "ض", "start": "ضـ", "middle": "ـضـ", "end": "ـض"}, 

    "Taa": { "isolated": "ط", "start": "طـ", "middle": "ـطـ", "end": "ـط"}, 
    "Zaa": { "isolated": "ظ", "start": "ظـ", "middle": "ـظـ", "end": "ـظ"}, 

    "Ain": { "isolated": "ع", "start": "عـ", "middle": "ـعـ", "end": "ـع"}, 
    "Ghayn": { "isolated": "غ", "start": "غـ", "middle": "ـغـ", "end": "ـغ"}, 

    "Fa": { "isolated": "ف", "start": "فـ", "middle": "ـفـ", "end": "ـف"}, 
    "Qaf": { "isolated": "ق", "start":"قـ", "middle": "ـقـ", "end": "ـق"}, 

    "Kaf": { "isolated": "ك", "start": "كـ", "middle": "ـكـ", "end": "ـك"}, 
    "Lam": { "isolated": "ل", "start": "لـ", "middle": "ـلـ", "end": "ـل"}, 

    "Meem": { "isolated": "م", "start": "مـ", "middle": "ـمـ", "end": "ـم"}, 
    "Noon": { "isolated": "ن", "start": "نـ", "middle": "ـنـ", "end": "ـن"}, 
    "Haa2": { "isolated": "ﻩ", "start": "هـ", "middle": "ـهـ", "end": "ـه"}, 
    "Waw": { "isolated": "و", "start": "و", "middle": "ـو", "end": "ـو"}, 
    "Ya": { "isolated": "ي", "start": "يـ", "middle": "ـيـ", "end": "ـي"}
};


const flashcardContainer = document.getElementById("flashcard-container");

let selectedForms = new Set(["isolated"]);
let flashcardsList = [];
let currentIndex = 0;

function updateFlashcards() {
    let prevIndex = currentIndex;
    flashcardsList = [];
    flashcardContainer.innerHTML = "";

    if (selectedForms.size === 0) {
        flashcardContainer.innerHTML = "<p style='text-align:center;'>Please select what forms you want to study</p>";
        return;
    }

    for (const [name, forms] of Object.entries(letters)) {
        selectedForms.forEach(form => {
            if (forms.hasOwnProperty(form)) {
                flashcardsList.push({ arabic: forms[form], english: name });
            }
        });
    }

    if (flashcardsList.length > 0) {
        currentIndex = Math.min(prevIndex, flashcardsList.length - 1);
        displayFlashcard();
    }
}

function displayFlashcard() {
    if (flashcardsList.length === 0) {
        flashcardContainer.innerHTML = "<p style='text-align:center;'>No flashcards available</p>";
        return;
    }

    flashcardContainer.innerHTML = "";

    let flashcard = document.createElement("div");
    flashcard.classList.add("flashcard");
    flashcard.innerHTML = `
        <div class="front" lang="ar" dir="rtl">${flashcardsList[currentIndex].arabic}</div>
        <div class="back" "lang="en" dir="ltr">${flashcardsList[currentIndex].english}</div>
    `;
    flashcard.addEventListener("click", function () {
        this.classList.toggle("flipped");
    });

    flashcardContainer.appendChild(flashcard);
}

// Event Listeners
document.querySelectorAll(".form-checkbox").forEach(checkbox =>{
    checkbox.addEventListener("change", function () {
        this.checked ? selectedForms.add(this.value) : selectedForms.delete(this.value);
        updateFlashcards();
    });
});

// Randamize array in-place using Durstenfeld shuffle algorithm
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function nextCard() {
    if (flashcardsList.length > 0) {
        currentIndex = (currentIndex + 1) % flashcardsList.length;
        displayFlashcard(); 
    }
}

function previousCard() { 
    if (flashcardsList.length > 0) {
        currentIndex = (currentIndex - 1 + flashcardsList.length) % flashcardsList.length;
        displayFlashcard(); 
    }    
}

document.getElementById("nextBtn").addEventListener("click", nextCard);
document.getElementById("prevBtn").addEventListener("click", previousCard);
document.getElementById("shuffleBtn").addEventListener("click", () => { 
    if (flashcardsList.length > 1) { 
        shuffleArray(flashcardsList);
        displayFlashcard(); 
    }
});

/*document.addEventListener("DOMContentLoaded", function () {
    const naviationContainer = document.querySelector(".navigation");

    if (naviationContainer) {
        // Check if left arrow exists; if not, create it
        if (!document.querySelector(".nav-btn.prev")) {
            let leftArrow = document.createElement("button");
            leftArrow.className = "nav-btn prev";
            leftArrow.innerHTML = "&#9664;"  // left arrow symbol
            leftArrow.onclick = function () { previousCard();};
            naviationContainer.prepend(leftArrow);
        }
        
        // Check if right arrow exists; if not, create it
        if (!document.querySelector(".nav-btn.next")) {
            let rightArrow = document.createElement("button");
            rightArrow.className = "nav-btn prev";
            rightArrow.innerHTML = "&#9654;"  // right arrow symbol
            rightArrow.onclick = function () { nextCard();};
            naviationContainer.appendChild(rightArrow);
        }
    }
})
*/

document.addEventListener("DOMContentLoaded", updateFlashcards);

