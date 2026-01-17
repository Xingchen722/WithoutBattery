from exa_py import Exa
import os
from dotenv import load_dotenv

load_dotenv()

exa = Exa(api_key=os.getenv("EXA_API_KEY"))

results = exa.search(
    "recursion explained for beginners",
    num_results=3
)

for r in results.results:
    print(r.title)
    print(r.url)
    print()
