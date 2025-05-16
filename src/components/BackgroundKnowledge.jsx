import React, { useEffect } from 'react';
import './BackgroundKnowledge.css';

const BackgroundKnowledge = ({ background }) => {
  useEffect(() => {
    // Show more stocks functionality
    const handleShowMoreStocks = (event) => {
      if (event.target.classList.contains('show-more-stocks')) {
        const container = event.target.closest('.stock-buttons');
        const remainingStocks = JSON.parse(container.dataset.remaining || '[]');
        
        const newButtons = remainingStocks.map(stock => 
          `<button onclick="navigateToStock('${stock.code}')">${stock.name}</button>`
        ).join('');
        
        event.target.insertAdjacentHTML('beforebegin', newButtons);
        event.target.remove();
      }
    };

    // Add click event listener to document
    document.addEventListener('click', handleShowMoreStocks);

    // Cleanup
    return () => {
      document.removeEventListener('click', handleShowMoreStocks);
    };
  }, [background]); // Re-run effect when background changes

  if (!background) return null;

  return (
    <div 
      className="background-knowledge"
      dangerouslySetInnerHTML={{ __html: background }}
    />
  );
};

export default BackgroundKnowledge; 